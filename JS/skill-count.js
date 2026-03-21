document.addEventListener('DOMContentLoaded', () => {
    const previewCanvas = document.getElementById('previewCanvas');
    const countResults = document.getElementById('countResults');
    const resGold = document.getElementById('res-gold');
    const resWhite = document.getElementById('res-white');
    const sendButton = document.getElementById('sendToSimulatorButton');

    let currentGoldCount = 0;
    let currentWhiteCount = 0;

    document.addEventListener('onImagesMerged', () => {
        analyzeCanvasRobust(previewCanvas);
    });

    sendButton.addEventListener('click', () => {
        const targetDistance = document.getElementById('targetDistance').value;
        const pendingData = {
            goldSkill: currentGoldCount,
            whiteSkill: currentWhiteCount,
            distance: targetDistance
        };
        sessionStorage.setItem('pendingSkills', JSON.stringify(pendingData));
        window.location.href = 'simulator.html';
    });

    // 本格的なスキル解析処理
    function analyzeCanvasRobust(canvas) {
        if (!canvas || canvas.width === 0 || canvas.height === 0) return;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const width = canvas.width;
        const height = canvas.height;
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;

        // 【手法】
        // 1. 水平投影(Horizontal Projection) を行い、行ごとのエッジ（または色の変化）の強度を求める
        // 2. その強度分布から、スキルの区切りとなる「背景の隙間」や「枠線の水平ライン」を見つける
        // 3. 区切られた矩形領域（スキル行）ごとに中央付近の色をサンプリングし、レアリティを特定する

        // STEP 1: 垂直方向のエッジ強度（Y軸微分）を計算する
        // 縦線やスクロールバー等のノイズはY方向に色が変化しないため無視でき、
        // スキルの枠線やアイコン、文字などはY方向に激しく変化するため、確実にスキル行のみを検出できる。
        const rowVariances = new Float32Array(height);

        for (let y = 0; y < height - 1; y++) {
            let variance = 0;
            // Xの範囲を幅広く（10% ~ 90%）戻す。Y微分なら縦線は無視されるため横幅広くても安全。
            const startX = Math.floor(width * 0.1);
            const endX = Math.floor(width * 0.9);

            for (let x = startX; x < endX; x++) {
                const idx = (y * width + x) * 4;
                const nIdx = ((y + 1) * width + x) * 4; // 1ピクセル下と比較

                // 上下ピクセル間の色差分を合算
                const diffR = Math.abs(data[idx] - data[nIdx]);
                const diffG = Math.abs(data[idx + 1] - data[nIdx + 1]);
                const diffB = Math.abs(data[idx + 2] - data[nIdx + 2]);

                variance += (diffR + diffG + diffB);
            }
            rowVariances[y] = variance;
        }
        // 最後の行はエラー防止の為一つ前と同じで埋める
        rowVariances[height - 1] = rowVariances[height - 2];

        // STEP 2: 行の「上端」を検出する（2パス自動キャリブレーション方式）
        // スキルが隙間なく並ぶ場合、「エッジが少ない＝隙間」方式は機能しない。
        // 1stパス: ゆるい閾値で粗くエッジを検出 → 行間隔のメジアンからスキル行高さを自動推定
        // 2ndパス: 推定値を基に精密検出

        // rowVariancesを平滑化（11px幅の移動平均）してノイズを軽減
        const smoothed = new Float32Array(height);
        const halfW = 5;
        for (let y = 0; y < height; y++) {
            let sum = 0, cnt = 0;
            for (let dy = -halfW; dy <= halfW; dy++) {
                const ny = y + dy;
                if (ny >= 0 && ny < height) { sum += rowVariances[ny]; cnt++; }
            }
            smoothed[y] = sum / cnt;
        }

        const riseThreshold = calculateAverage(smoothed) * 0.5;

        // ── 1stパス: ゆるいminBlockH（幅の5%以上で最低15px）で粗く候補を列挙 ──
        const looseMinH = Math.max(Math.floor(width * 0.05), 15);
        const roughEdges = [];
        for (let y = 1; y < height; y++) {
            if (smoothed[y] > riseThreshold && smoothed[y] > smoothed[y - 1] * 1.3) {
                if (roughEdges.length === 0 || y - roughEdges[roughEdges.length - 1] >= looseMinH) {
                    roughEdges.push(y);
                }
            }
        }

        // ── 行間隔のメジアンからスキル1行の高さを推定 ──
        let minBlockH;
        let medianGap = 0; // 行の高さ補正用に保持
        if (roughEdges.length >= 3) {
            const gaps = [];
            for (let i = 1; i < roughEdges.length; i++) gaps.push(roughEdges[i] - roughEdges[i - 1]);
            gaps.sort((a, b) => a - b);
            medianGap = gaps[Math.floor(gaps.length / 2)];
            // メジアン間隔の70%を最小ブロック高とする（小さすぎるエッジを除外）
            minBlockH = Math.max(Math.floor(medianGap * 0.70), looseMinH);
        } else {
            // 候補が少ない場合はwidthベースのデフォルト値を使用
            minBlockH = Math.max(Math.floor(width * 0.10), 30);
        }

        // ── 2ndパス: キャリブレーション済みminBlockHで精密検出 ──
        const edgeStarts = [];
        for (let y = 1; y < height; y++) {
            if (smoothed[y] > riseThreshold && smoothed[y] > smoothed[y - 1] * 1.3) {
                if (edgeStarts.length === 0 || y - edgeStarts[edgeStarts.length - 1] >= minBlockH) {
                    edgeStarts.push(y);
                }
            }
        }

        // フォールバック: エッジが全く検出されなかった場合は旧方式
        let skillRows = [];
        if (edgeStarts.length === 0) {
            const threshold = calculateAverage(rowVariances) * 0.4;
            let inBlock = false;
            let blockStartY = 0;
            for (let y = 0; y < height; y++) {
                if (rowVariances[y] > threshold) {
                    if (!inBlock) { inBlock = true; blockStartY = y; }
                } else {
                    if (inBlock) {
                        if (y - blockStartY > minBlockH) skillRows.push({ startY: blockStartY, endY: y });
                        inBlock = false;
                    }
                }
            }
            if (inBlock && height - blockStartY > minBlockH) skillRows.push({ startY: blockStartY, endY: height });
        } else {
            // ヘッダーやフッター（閉じるボタン等）を避けるため、上下を一定ピクセル削る
            // 合成された画像全体の高さに関わらず、固定ピクセルで指定（標準的な解像度を想定）
            const topFieldHeight = 490;   // ヘッダー（名前、属性タブ等）
            const bottomFieldHeight = 200; // フッター（閉じるボタン等）

            for (let i = 0; i < edgeStarts.length; i++) {
                let startY = edgeStarts[i];
                let endY = (i + 1 < edgeStarts.length) ? edgeStarts[i + 1] : (startY + (medianGap || minBlockH));

                // 範囲外の行をスキップ（検出された開始点を基準に判定）
                if (startY < topFieldHeight || startY > height - bottomFieldHeight) continue;

                // 修正: 行の高さ（endY - startY）が medianGap より著しく低い場合（最上部で起こりやすい）
                // 高さを medianGap に揃えて判定枠とサンプリング位置（centerY）を安定させる
                if (medianGap > 0) {
                    const currentH = endY - startY;
                    if (currentH < medianGap * 0.95 || currentH > medianGap * 1.1) {
                        if (skillRows.length === 0) {
                            // 最上部の行の場合、次の行の開始点(endY)を基準にして上に広げる
                            // これにより、ヘッダー除外で削られた上端を補完し中心をアイコンに合わせる
                            startY = endY - medianGap;
                        } else {
                            // それ以外の行は開始点を固定して高さを揃える
                            endY = startY + medianGap;
                        }
                    }
                }

                // 全体を 5ピクセル下にずらしてサンプリング位置を微調整
                startY += 20;
                endY += 20;

                skillRows.push({ startY, endY });
            }
        }

        // STEP 3: 見つかったブロックごとに色をサンプリング
        let goldCount = 0;
        let whiteCount = 0;

        // RGBからHSVへの変換関数
        function rgbToHsv(r, g, b) {
            r /= 255; g /= 255; b /= 255;
            let max = Math.max(r, g, b), min = Math.min(r, g, b);
            let h, s, v = max;
            let d = max - min;
            s = max === 0 ? 0 : d / max;
            if (max === min) {
                h = 0;
            } else {
                switch (max) {
                    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                    case g: h = (b - r) / d + 2; break;
                    case b: h = (r - g) / d + 4; break;
                }
                h /= 6;
            }
            return { h: h * 360, s: s * 100, v: v * 100 };
        }

        // 色判定ロジック
        function getColorType(r, g, b) {
            const hsv = rgbToHsv(r, g, b);

            // ユーザー提供の基準色:
            // 進化スキル: #ffb0de (H: 325, S: 31, V: 100)
            // 金スキル: #ffd363   (H: 43, S: 61, V: 100)
            // 白スキル: #c6c6d3   (H: 240, S: 10, V: 80)

            // ピンク・マゼンタ系 (進化スキル枠)
            // 基準色周辺を広くカバーする (H: 320~345 , S: 30%以上, V: 85%以上)
            if (
                hsv.h >= 320 && hsv.h <= 345 &&
                hsv.v >= 85 &&
                r > g + 10 &&   // ← ここが重要
                r > b + 5       // ← 白との分離
            ) {
                return 'gold';
            }

            // 金・オレンジ・黄色系 (金スキル枠)
            // 基準色周辺をカバー (H: 15~60, S: 25%以上, V: 60%以上)
            if (
                hsv.h >= 25 && hsv.h <= 55 &&
                hsv.s >= 40 &&
                hsv.v >= 70 &&
                r > g && g > b   // 黄色系の特徴
            ) {
                return 'gold';
            }

            // 白系（白・継承スキル枠）
            // 基準色(#c6c6d3)のように彩度が非常に低いもの
            if (hsv.s < 15 && hsv.v > 70) {
                return 'white';
            }

            return 'unknown';
        }

        for (let row of skillRows) {
            const centerY = Math.floor((row.startY + row.endY) / 2);
            const ySamples = [centerY - 3, centerY, centerY + 3];

            // 左列: 15%~25%, 右列: 63%~73% (アイコンの中心を捉えるよう調整)
            const xRanges = [
                { label: 'L', start: 32, end: 42 },
                { label: 'R', start: 63, end: 73 }
            ];

            for (let range of xRanges) {
                const xSamples = [];
                for (let p = range.start; p <= range.end; p += 4) {
                    xSamples.push(Math.floor(width * (p / 100)));
                }

                let colorLog = { gold: 0, white: 0, unknown: 0 };

                for (let y of ySamples) {
                    if (y < 0 || y >= height) continue;
                    for (let x of xSamples) {
                        const idx = (y * width + x) * 4;
                        const r = data[idx];
                        const g = data[idx + 1];
                        const b = data[idx + 2];
                        const type = getColorType(r, g, b);
                        colorLog[type]++;


                    }
                }

                const totalSamples = ySamples.length * xSamples.length;

                if (colorLog.gold > totalSamples * 0.10) {
                    goldCount++;
                } else if (colorLog.white > totalSamples * 0.25) { // 閾値を15%->25%に引き上げ
                    whiteCount++;
                } else {
                }


            }
        }

        currentGoldCount = goldCount;
        currentWhiteCount = whiteCount;

        resGold.textContent = currentGoldCount;
        resWhite.textContent = currentWhiteCount;

        countResults.style.display = 'block';
    }

    function calculateAverage(arr) {
        let sum = 0;
        for (let i = 0; i < arr.length; i++) {
            sum += arr[i];
        }
        return sum / arr.length;
    }
});
