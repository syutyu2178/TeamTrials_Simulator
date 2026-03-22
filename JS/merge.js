document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadArea');
    const imageList = document.getElementById('imageList');
    const mergeButton = document.getElementById('mergeButton');
    const clearButton = document.getElementById('clearButton');
    const downloadButton = document.getElementById('downloadButton');
    const previewSection = document.getElementById('previewSection');
    const previewCanvas = document.getElementById('previewCanvas');
    const progressContainer = document.getElementById('progressContainer');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const errorMessage = document.getElementById('errorMessage');

    let uploadedFiles = [];
    let imageObjects = []; // 読み込まれたImageオブジェクトの配列

    // ファイルアップロード制御
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    // クリップボードからの貼り付け(Ctrl+V)対応
    window.addEventListener('paste', (e) => {
        const items = e.clipboardData.items;
        const files = [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                if (blob) {
                    // 貼り付けた画像に名前を付ける（任意）
                    const file = new File([blob], `pasted_image_${Date.now()}_${i}.png`, { type: blob.type });
                    files.push(file);
                }
            }
        }
        if (files.length > 0) {
            handleFiles(files);
        }
    });

    function handleFiles(files) {
        Array.from(files).forEach(file => {
            if (file.type.startsWith('image/')) {
                uploadedFiles.push(file);
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        imageObjects.push({ file, img, src: e.target.result });
                        renderImageList();
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            }
        });
    }

    function renderImageList() {
        imageList.innerHTML = '';
        imageObjects.forEach((obj, index) => {
            const div = document.createElement('div');
            div.className = 'image-item';

            const img = document.createElement('img');
            img.src = obj.src;

            const name = document.createElement('div');
            name.className = 'image-item-info';
            name.textContent = obj.file.name;

            const removeBtn = document.createElement('button');
            removeBtn.className = 'image-item-remove';
            removeBtn.innerHTML = '&times;';
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                uploadedFiles.splice(index, 1);
                imageObjects.splice(index, 1);
                renderImageList();
            };

            div.appendChild(img);
            div.appendChild(name);
            div.appendChild(removeBtn);
            imageList.appendChild(div);
        });
    }

    clearButton.addEventListener('click', () => {
        uploadedFiles = [];
        imageObjects = [];
        renderImageList();
        previewSection.style.display = 'none';
        errorMessage.style.display = 'none';
        const ctx = previewCanvas.getContext('2d');
        ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        document.getElementById('countResults').style.display = 'none';
    });

    // メインの結合処理
    mergeButton.addEventListener('click', async () => {
        if (imageObjects.length === 0) {
            showError("画像がアップロードされていません。");
            return;
        }

        errorMessage.style.display = 'none';
        previewSection.style.display = 'none';
        progressContainer.style.display = 'block';
        updateProgress(0, "画像を処理中...");

        try {
            // STEP 1: 画像の向き判定とクロップ処理を行い、処理用Canvasデータを生成
            let processedImages = [];
            for (let i = 0; i < imageObjects.length; i++) {
                updateProgress((i / imageObjects.length) * 20, `画像をクロップ中 (${i + 1}/${imageObjects.length})`);
                await new Promise(resolve => setTimeout(resolve, 10)); // UI描画の一時停止回避
                processedImages.push(preprocessImage(imageObjects[i].img));
            }

            // STEP 2: ヘッダー・フッターの共通高さ検出
            let globalHeaderHeight = 0;
            let globalFooterHeight = 0;
            if (processedImages.length > 1) {
                const uiHeights = detectHeaderFooter(processedImages[0], processedImages[1]);
                globalHeaderHeight = uiHeights.headerHeight;
                globalFooterHeight = uiHeights.footerHeight;
            }

            // STEP 3: 結合順位（パズル）の解析とオーバーラップ計算
            updateProgress(30, "最適な結合順序を解析中...");
            await new Promise(resolve => setTimeout(resolve, 10));

            const mergeResult = await findBestSequenceAndOverlaps(processedImages, globalHeaderHeight, globalFooterHeight);

            // STEP 4: 最終的な結合画像の生成
            updateProgress(80, "画像を結合描画中...");
            await new Promise(resolve => setTimeout(resolve, 10));

            const mergedCanvas = drawMergedCanvas(processedImages, mergeResult.sequence, mergeResult.overlaps, globalHeaderHeight, globalFooterHeight);

            // STEP 5: プレビュー更新
            updateProgress(95, "プレビューを生成中...");
            previewCanvas.width = mergedCanvas.width;
            previewCanvas.height = mergedCanvas.height;
            const ctx = previewCanvas.getContext('2d');
            ctx.drawImage(mergedCanvas, 0, 0);

            progressContainer.style.display = 'none';
            previewSection.style.display = 'block';

            // スキルカウント側のイベント発火
            document.dispatchEvent(new Event('onImagesMerged'));

        } catch (err) {
            console.error(err);
            showError("画像処理中にエラーが発生しました: " + err.message);
            progressContainer.style.display = 'none';
        }
    });

    downloadButton.addEventListener('click', () => {
        const link = document.createElement('a');
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        link.download = `merged_skills_${yyyy}${mm}${dd}.png`;
        link.href = previewCanvas.toDataURL('image/png');
        link.click();
    });

    function showError(msg) {
        errorMessage.textContent = msg;
        errorMessage.style.display = 'block';
    }

    function updateProgress(percent, text) {
        progressFill.style.width = percent + '%';
        progressText.textContent = text;
    }

    // 画像の事前処理（縦横判定とクロップ）
    function preprocessImage(img) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const isLandscape = img.width > img.height;

        if (isLandscape) {
            // 横長の場合：画面中央から左側だけをマージ（左端8%は除外）
            // つまり x = width * 0.08 から幅 width * 0.42 を対象とする。
            const startX = Math.floor(img.width * 0.08);
            const cropWidth = Math.floor(img.width * 0.42); // 0.5 - 0.08 = 0.42

            canvas.width = cropWidth;
            canvas.height = img.height;

            // drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
            ctx.drawImage(img, startX, 0, cropWidth, img.height, 0, 0, cropWidth, img.height);
        } else {
            // 縦長の場合：そのまま
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
        }

        return canvas;
    }

    // 2つのCanvasから共通のヘッダー・フッターの高さを検出する
    function detectHeaderFooter(canvas1, canvas2) {
        const ctx1 = canvas1.getContext('2d', { willReadFrequently: true });
        const ctx2 = canvas2.getContext('2d', { willReadFrequently: true });

        const w = Math.min(canvas1.width, canvas2.width);
        const h1 = canvas1.height;
        const h2 = canvas2.height;

        const data1 = ctx1.getImageData(0, 0, w, h1).data;
        const data2 = ctx2.getImageData(0, 0, w, h2).data;

        let headerHeight = 0;
        let footerHeight = 0;

        const matchThreshold = 5; // 多少のノイズ（動画圧縮等）を許容するピクセルごとの差分
        // ヘッダー検出（上から比較）
        // 時計等の変化を避けるため、画面中央 30% 〜 70% のみを比較する
        for (let y = 0; y < Math.min(h1, h2); y++) {
            let rowMatch = true;
            for (let x = Math.floor(w * 0.3); x < Math.floor(w * 0.7); x += 2) {
                const idx1 = (y * w + x) * 4;
                const idx2 = (y * w + x) * 4;
                const diff = Math.abs(data1[idx1] - data2[idx2]) + Math.abs(data1[idx1 + 1] - data2[idx2 + 1]) + Math.abs(data1[idx1 + 2] - data2[idx2 + 2]);
                if (diff > matchThreshold * 3) {
                    rowMatch = false;
                    break;
                }
            }
            if (!rowMatch) break;
            headerHeight = y;
        }

        // フッター検出（下から比較）
        for (let y = 1; y < Math.min(h1, h2) - headerHeight; y++) {
            let rowMatch = true;
            for (let x = Math.floor(w * 0.3); x < Math.floor(w * 0.7); x += 2) {
                const idx1 = ((h1 - y) * w + x) * 4;
                const idx2 = ((h2 - y) * w + x) * 4;
                const diff = Math.abs(data1[idx1] - data2[idx2]) + Math.abs(data1[idx1 + 1] - data2[idx2 + 1]) + Math.abs(data1[idx1 + 2] - data2[idx2 + 2]);
                if (diff > matchThreshold * 3) {
                    rowMatch = false;
                    break;
                }
            }
            if (!rowMatch) break;
            footerHeight = y;
        }

        console.log(`Detected Fixed UI - Header: ${headerHeight}px, Footer: ${footerHeight}px`);
        return { headerHeight, footerHeight };
    }

    // 2つのCanvas間の最適なオーバーラップとスコアを計算する
    function computeOverlap(imgData1, imgData2, headerHeight, footerHeight) {
        const w = Math.min(imgData1.width, imgData2.width);
        const h1 = imgData1.height;
        const h2 = imgData2.height;

        const data1 = imgData1.data;
        const data2 = imgData2.data;

        const scrollH1 = h1 - headerHeight - footerHeight;
        const scrollH2 = h2 - headerHeight - footerHeight;

        if (scrollH1 <= 10 || scrollH2 <= 10) return { score: Infinity, overlap: 0 };

        const minOverlap = Math.floor(Math.min(scrollH1, scrollH2) * 0.05);
        const maxOverlap = Math.floor(Math.min(scrollH1, scrollH2) * 0.95);

        const stepX = 15;
        const stepY = 15;

        let bestOverlapHeight = 0;
        let bestScore = Infinity;

        for (let overlap = minOverlap; overlap < maxOverlap; overlap += 2) {
            let score = 0;
            let sampleCount = 0;

            for (let y = 0; y < overlap; y += stepY) {
                const y1 = headerHeight + scrollH1 - overlap + y;
                const y2 = headerHeight + y;

                for (let x = Math.floor(w * 0.2); x < Math.floor(w * 0.8); x += stepX) {
                    const idx1 = (y1 * imgData1.width + x) * 4;
                    const idx2 = (y2 * imgData2.width + x) * 4;

                    const diff = Math.abs(data1[idx1] - data2[idx2]) +
                        Math.abs(data1[idx1 + 1] - data2[idx2 + 1]) +
                        Math.abs(data1[idx1 + 2] - data2[idx2 + 2]);

                    score += diff;
                    sampleCount++;
                }
            }

            const avgScore = score / Math.max(1, sampleCount);

            if (avgScore < bestScore) {
                bestScore = avgScore;
                bestOverlapHeight = overlap;
            }
        }
        return { score: bestScore, overlap: bestOverlapHeight };
    }

    // すべての画像の最適な並び順を総当たり算出し、順序と重なり量を返す
    async function findBestSequenceAndOverlaps(images, headerHeight, footerHeight) {
        const N = images.length;
        if (N === 1) return { sequence: [0], overlaps: [] };

        // 各画像のデータを取得してキャッシュ
        const imageDataList = images.map(canvas => {
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            return ctx.getImageData(0, 0, canvas.width, canvas.height);
        });

        // 組み合わせ総当たりスコアのマトリクス
        const matrix = [];
        for (let i = 0; i < N; i++) {
            matrix[i] = [];
            for (let j = 0; j < N; j++) {
                if (i === j) {
                    matrix[i][j] = { score: Infinity, overlap: 0 };
                    continue;
                }
                matrix[i][j] = computeOverlap(imageDataList[i], imageDataList[j], headerHeight, footerHeight);
            }
        }

        // 最適な順列を全探索 (N! 通り)
        let bestSequence = [];
        let bestTotalScore = Infinity;
        let bestOverlaps = [];

        function permute(arr, memo = []) {
            if (arr.length === 0) {
                let currentScore = 0;
                let currentOverlaps = [];
                for (let k = 0; k < memo.length - 1; k++) {
                    const from = memo[k];
                    const to = memo[k + 1];
                    currentScore += matrix[from][to].score;
                    currentOverlaps.push(matrix[from][to].overlap);
                }
                if (currentScore < bestTotalScore || bestSequence.length === 0) {
                    bestTotalScore = currentScore;
                    bestSequence = [...memo];
                    bestOverlaps = [...currentOverlaps];
                }
            } else {
                for (let i = 0; i < arr.length; i++) {
                    let curr = arr.slice();
                    let next = curr.splice(i, 1);
                    permute(curr, memo.concat(next));
                }
            }
        }

        const indices = Array.from({ length: N }, (_, i) => i);
        // 通常は3〜5枚程度なので全探索。万が一多すぎる場合は処理落ちを防ぐため最初の順序をそのまま使う
        if (N <= 7) {
            permute(indices);
        } else {
            console.warn("Too many images for permutation search. Using original order.");
            bestSequence = indices;
            for (let i = 0; i < N - 1; i++) {
                bestOverlaps.push(matrix[i][i + 1].overlap);
            }
        }

        console.log("Calculated Best Sequence:", bestSequence);
        return { sequence: bestSequence, overlaps: bestOverlaps };
    }

    // 最適な順序に従って巨大な１枚のCanvasに全てを描画する
    function drawMergedCanvas(images, sequence, overlaps, headerHeight, footerHeight) {
        if (images.length === 0) return null;
        if (images.length === 1) return images[0];

        const w = Math.min(...images.map(c => c.width));

        // 最終画像の高さを計算
        // h = 最初の画像のヘッダー + 各画像の正味スクロール高 + 最後の画像のフッター
        let finalScrollArea = images[sequence[0]].height - headerHeight - footerHeight;
        for (let k = 0; k < sequence.length - 1; k++) {
            const currentImg = images[sequence[k + 1]];
            const scrollH = currentImg.height - headerHeight - footerHeight;
            finalScrollArea += (scrollH - overlaps[k]);
        }

        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = w;
        finalCanvas.height = headerHeight + finalScrollArea + footerHeight;
        const fCtx = finalCanvas.getContext('2d');

        // 先頭画像のヘッダー描画
        fCtx.drawImage(images[sequence[0]], 0, 0, w, headerHeight, 0, 0, w, headerHeight);

        let currentDestY = headerHeight;

        // 各画像のスクロール領域を描画
        for (let k = 0; k < sequence.length; k++) {
            const img = images[sequence[k]];
            const imgScrollH = img.height - headerHeight - footerHeight;

            let srcY = headerHeight;
            let drawH = imgScrollH;

            if (k > 0) {
                // 重複部分（前の画像で描画済み）を切り詰める
                const prevOverlap = overlaps[k - 1];
                srcY += prevOverlap;
                drawH -= prevOverlap;
            }

            fCtx.drawImage(img, 0, srcY, w, drawH, 0, currentDestY, w, drawH);
            currentDestY += drawH;
        }

        // 末尾画像のフッター描画
        const lastImg = images[sequence[sequence.length - 1]];
        fCtx.drawImage(lastImg, 0, lastImg.height - footerHeight, w, footerHeight, 0, currentDestY, w, footerHeight);

        return finalCanvas;
    }
});
