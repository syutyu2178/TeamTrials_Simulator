(() => {
    const root = document.getElementById("sidebar-root");
    if (!root) throw new Error("sidebar-root not found");

    const pages = [
        { href: "index.html", label: "ホーム" },
        { href: "skill-count.html", label: "スキルカウント" },
        { href: "simulator.html", label: "シミュレーター" },
    ];

    const STORAGE_KEY = "sidebar-collapsed";

    // 初期状態復元
    if (localStorage.getItem(STORAGE_KEY) === "1") {
        document.body.classList.add("sidebar-collapsed");
    }

    root.innerHTML = `
        <aside class="sidebar">
            <button class="sidebar-toggle" id="sidebar-toggle" aria-label="Toggle sidebar">
                ☰
            </button>

            <div class="sidebar-title">機能一覧</div>
            <ul class="sidebar-nav">
                ${pages.map(p => `<li><a href="${p.href}">${p.label}</a></li>`).join("")}
            </ul>
        </aside>
    `;

    const toggleButton = document.getElementById("sidebar-toggle");

    toggleButton.addEventListener("click", () => {
        const collapsed = document.body.classList.toggle("sidebar-collapsed");
        localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    });
})();
