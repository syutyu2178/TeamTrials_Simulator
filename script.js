// ===============================
// モーダル開閉・slotクリック専用
// ===============================

// 要素取得
const modal = document.getElementById("edit-modal");
const modalBackdrop = modal.querySelector(".modal-backdrop");
const cancelButton = document.getElementById("modal-cancel");

// 全 slot にクリックイベントを付与
document.querySelectorAll(".slot").forEach(slot => {
  slot.addEventListener("click", () => {
    const course = slot.closest(".course").dataset.course;
    const slotIndex = slot.dataset.slotIndex;

    openModal(course, slotIndex);

    const key = `${course}-${slotIndex}`;
    const data = slotDataMap.get(key);

    if (data) {
      fillForm(data);
    } else {
      clearForm();
    }
  });
});

// モーダルを開く
function openModal(course, slotIndex) {
  modal.dataset.course = course;
  modal.dataset.slotIndex = slotIndex;

  const key = `${course}-${slotIndex}`;
  const hasData = slotDataMap.has(key);

  deleteButton.style.display = hasData ? "inline-block" : "none";

  modal.classList.remove("hidden");
}


// モーダルを閉じる
function closeModal() {
  modal.classList.add("hidden");
}

// キャンセルボタン
cancelButton.addEventListener("click", closeModal);

// 背景クリックで閉じる
modalBackdrop.addEventListener("click", closeModal);

// フォームにデータを埋める
function fillForm(data) {
  document.getElementById("input-name").value = data.name;
  document.getElementById("input-style").value = data.style;
  document.getElementById("input-ace").checked = data.isAce;
}

// フォームをクリア
function clearForm() {
  document.getElementById("input-name").value = "";
  document.getElementById("input-style").value = "escape";
  document.getElementById("input-ace").checked = false;
  document.getElementById("input-start-dash").checked = false;
}


// ===============================
// モーダル内削除処理
// ===============================

const deleteButton = document.getElementById("modal-delete");

// 削除ボタン
deleteButton.addEventListener("click", () => {
  const course = modal.dataset.course;
  const slotIndex = modal.dataset.slotIndex;

  const slot = document.querySelector(
    `.course[data-course="${course}"] .slot[data-slot-index="${slotIndex}"]`
  );

  const key = `${course}-${slotIndex}`;

  // データ削除
  slotDataMap.delete(key);
  resetSlot(slot);

  reorderSlotsInCourse(course);
  updateGlobalRanks();

  saveToLocalStorage();
  closeModal();

});


// slotをemptyに戻す
function resetSlot(slot) {
  slot.classList.remove("filled");
  slot.classList.add("empty");
  slot.dataset.filled = "false";

  slot.innerHTML = `
    <div class="empty-label">＋</div>
  `;
}


// ===============================
// モーダル内保存処理
// ===============================

// slotごとの仮データ保持用
// key: "course-slotIndex"
const slotDataMap = new Map();

const saveButton = document.getElementById("modal-save");

// 保存ボタン
saveButton.addEventListener("click", () => {
  const course = modal.dataset.course;
  const slotIndex = modal.dataset.slotIndex;

  const slot = document.querySelector(
    `.course[data-course="${course}"] .slot[data-slot-index="${slotIndex}"]`
  );

  // フォームからデータ取得
  const data = {
    name: document.getElementById("input-name").value || "（未設定）",
    style: document.getElementById("input-style").value,
    wisdom: Number(document.getElementById("input-wisdom").value) || 0,

    isAce: document.getElementById("input-ace").checked,
    startDash: document.getElementById("input-start-dash").checked,

    uniqueRarity: document.getElementById("input-unique-rarity").value,
    uniqueLevel: Number(document.getElementById("input-unique-level").value),
    uniqueActivation: Number(document.getElementById("input-unique-activation").value),

    goldSkill: Number(document.getElementById("input-gold-skill").value) || 0,
    whiteSkill: Number(document.getElementById("input-white-skill").value) || 0,
    inheritSkill: Number(document.getElementById("input-inherit-skill").value) || 0
  };

  // スコア計算
  data.score = calculateScore(data);

  slotDataMap.set(`${course}-${slotIndex}`, data);
  fillSlot(slot, data);

  reorderSlotsInCourse(course);
  updateGlobalRanks();

  saveToLocalStorage();
  closeModal();

});

// slotにデータを反映
function fillSlot(slot, data) {
  slot.classList.remove("empty");
  slot.classList.add("filled");
  slot.dataset.filled = "true";

  const styleTextMap = {
    escape: "逃げ",
    leading: "先行",
    between: "差し",
    chasing: "追込"
  };

  slot.innerHTML = `
    <div class="slot-header">
      <span class="style-label ${data.style}">
        ${styleTextMap[data.style]}
      </span>
      ${data.isAce ? `<span class="ace-label">ACE</span>` : ""}
    </div>
    <div class="slot-name">${data.name}</div>
    <div class="slot-score">${data.score.toLocaleString()} pt</div>
    <div class="slot-rank"></div>
  `;
}


// ===============================
// スコア計算ロジック
// ===============================

// スコアの計算
const UNIQUE_SCORE_HIGH = {
  1: 2000,
  2: 2200,
  3: 2300,
  4: 2400,
  5: 2500,
  6: 2600
};

const UNIQUE_SCORE_LOW = {
  1: 1500,
  2: 1700,
  3: 1800,
  4: 1900,
  5: 2000
};

// 賢さからスキル発動率を計算
function calcActivationRate(wisdom) {
  if (wisdom <= 0) return 0;

  const effectiveWisdom =
    wisdom <= 1200
      ? wisdom
      : 1200 + (wisdom - 1200) / 2;

  return (100 - 9000 / effectiveWisdom) / 100;
}

function calculateScore(data) {
  let score = 0;

  /* ===== 固有スキル ===== */
  if (data.uniqueActivation > 0) {
    const table =
      data.uniqueRarity === "high"
        ? UNIQUE_SCORE_HIGH
        : UNIQUE_SCORE_LOW;

    const base = table[data.uniqueLevel] || 0;
    score += base * data.uniqueActivation;
  }

  /* ===== 通常スキル ===== */
  const rate = calcActivationRate(data.wisdom);

  score += rate * 1200 * data.goldSkill;
  score += rate * 500 * data.whiteSkill;
  score += rate * 500 * 2 * data.inheritSkill;

  /* ===== 立ち回り ===== */
  if (data.startDash) {
    score += 1000;
  }

  /* ===== エース ===== */
  if (data.isAce) {
    score *= 1.1;
  }

  return Math.floor(score);
}

// ===============================
// スコアランキング計算
// ===============================

// 全 slot のデータを配列で取得
function getAllUmaData() {
  const result = [];

  for (const [key, data] of slotDataMap.entries()) {
    result.push({
      key,          // "course-slotIndex"
      score: data.score
    });
  }

  return result;
}

// 全 slot データからランキングを計算
function calculateGlobalRanks() {
  const list = getAllUmaData();

  // スコア降順
  list.sort((a, b) => b.score - a.score);

  let currentRank = 0;
  let lastScore = null;

  list.forEach((item, index) => {
    if (item.score !== lastScore) {
      currentRank = index + 1;
      lastScore = item.score;
    }
    item.rank = currentRank;
  });

  return list;
}

// 全体ランキングを slot に反映
function updateGlobalRanks() {
  const rankedList = calculateGlobalRanks();

  rankedList.forEach(item => {
    const [course, slotIndex] = item.key.split("-");

    const slot = document.querySelector(
      `.course[data-course="${course}"] .slot[data-slot-index="${slotIndex}"]`
    );

    const rankEl = slot.querySelector(".slot-rank");
    if (rankEl) {
      rankEl.textContent = `全体 ${item.rank}位`;
    }
  });
}


// ================================
// slot並び替えロジック
// ================================

// 脚質の並び順定義
const STYLE_ORDER = {
  escape: 0,
  leading: 1,
  between: 2,
  chasing: 3
};

function reorderSlotsInCourse(course) {
  const courseEl = document.querySelector(
    `.course[data-course="${course}"]`
  );

  const slotsContainer = courseEl.querySelector(".slots");
  const slots = Array.from(slotsContainer.children);

  slots.sort((a, b) => {
    const aKey = `${course}-${a.dataset.slotIndex}`;
    const bKey = `${course}-${b.dataset.slotIndex}`;

    const aData = slotDataMap.get(aKey);
    const bData = slotDataMap.get(bKey);

    // empty は必ず下
    if (!aData && !bData) return 0;
    if (!aData) return 1;
    if (!bData) return -1;

    // ① ACE
    if (aData.isAce !== bData.isAce) {
      return aData.isAce ? -1 : 1;
    }

    // ② 脚質
    const styleDiff =
      STYLE_ORDER[aData.style] - STYLE_ORDER[bData.style];
    if (styleDiff !== 0) return styleDiff;

    // ③ 登録順（slot-index）
    return (
      Number(a.dataset.slotIndex) -
      Number(b.dataset.slotIndex)
    );
  });

  // DOM へ再配置
  slots.forEach(slot => slotsContainer.appendChild(slot));
}


// ===============================
// ローカルストレージ保存・復元
// ===============================

const STORAGE_KEY = "uma-arena-slot-data";

function saveToLocalStorage() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(Object.fromEntries(slotDataMap))
  );
}

// ローカルストレージから復元
function loadFromLocalStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  let stored;
  try {
    stored = JSON.parse(raw);
  } catch {
    return;
  }
  const storedSlots = stored.slots ?? stored;

  Object.entries(storedSlots).forEach(([key, data]) => {
    if (!key.includes("-")) return;

    const [course, slotIndex] = key.split("-", 2);

    const normalized = {
      name: data.name ?? "（未設定）",
      style: data.style ?? "escape",
      wisdom: data.wisdom ?? 0,

      isAce: data.isAce ?? false,
      startDash: data.startDash ?? false,

      uniqueRarity: data.uniqueRarity ?? "high",
      uniqueLevel: data.uniqueLevel ?? 4,
      uniqueActivation: data.uniqueActivation ?? 0,

      goldSkill: data.goldSkill ?? 0,
      whiteSkill: data.whiteSkill ?? 0,
      inheritSkill: data.inheritSkill ?? 0
    };

    // ★ 必ず再計算（アップデート耐性）
    normalized.score = calculateScore(normalized);

    slotDataMap.set(key, normalized);

    const slot = document.querySelector(
      `.course[data-course="${course}"] .slot[data-slot-index="${slotIndex}"]`
    );

    if (slot) {
      fillSlot(slot, normalized);
    }
  });

  // 並び替え・順位更新
  document.querySelectorAll(".course").forEach(courseEl => {
    reorderSlotsInCourse(courseEl.dataset.course);
  });
  updateGlobalRanks();
}

updateGlobalRanks();
loadFromLocalStorage();

// ===============================
// リセット・再読み込みボタン
// ===============================
const resetButton = document.getElementById("reset-button");

function openModal(course, slotIndex) {
  modal.dataset.course = course;
  modal.dataset.slotIndex = slotIndex;

  const key = `${course}-${slotIndex}`;
  deleteButton.style.display = slotDataMap.has(key)
    ? "inline-block"
    : "none";

  resetButton.disabled = true;   // ★ 追加
  modal.classList.remove("hidden");
}

function closeModal() {
  modal.classList.add("hidden");
  resetButton.disabled = false;  // ★ 追加
}

resetButton.addEventListener("click", () => {
  const ok = confirm(
    "全データを削除してページを再読み込みします。\nよろしいですか？"
  );
  if (!ok) return;

  // LocalStorage 全削除（このアプリ分だけ）
  localStorage.removeItem("uma-arena-slot-data");

  // ほぼ Ctrl + F5 相当
  location.reload();
});
