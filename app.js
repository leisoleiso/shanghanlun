(function () {
  "use strict";

  var SHLH = (typeof SHLH_DATA !== "undefined") ? SHLH_DATA : [];
  var JG = (typeof JINGUI_DATA !== "undefined") ? JINGUI_DATA : [];
  var formulas = (typeof FORMULAS !== "undefined" ? FORMULAS : [])
    .concat(typeof JINGUI_FORMULAS !== "undefined" ? JINGUI_FORMULAS : []);
  var symptoms = (typeof SYMPTOM_INDEX !== "undefined") ? SYMPTOM_INDEX : [];

  // 合并两本书
  var data = [];
  SHLH.forEach(function (e) { data.push(Object.assign({ book: "伤寒论" }, e)); });
  JG.forEach(function (e) { data.push(Object.assign({ book: "金匮要略", category: e.chapter }, e)); });

  var $ = function (id) { return document.getElementById(id); };
  var searchEl = $("search");
  var clearBtn = $("clear-search");
  var bookEl = $("book-filter");
  var catEl = $("category-filter");
  var listEl = $("list");
  var emptyEl = $("empty");
  var metaEl = $("result-meta");
  var symEl = $("symptom-results");
  var modalEl = $("modal");
  var modalBody = $("modal-body");

  var state = { query: "", book: "", category: "", theme: "light", fs: 17 };
  var CONTEXT = 2;
  var modalIndex = -1;

  /* ---------- 偏好 ---------- */
  function loadPrefs() {
    try {
      var t = localStorage.getItem("shl_theme");
      var f = parseInt(localStorage.getItem("shl_fs"), 10);
      if (t === "dark" || t === "sepia") state.theme = t;
      if (f >= 14 && f <= 24) state.fs = f;
    } catch (e) {}
  }
  function savePrefs() {
    try {
      localStorage.setItem("shl_theme", state.theme);
      localStorage.setItem("shl_fs", state.fs);
    } catch (e) {}
  }
  function applyPrefs() {
    document.documentElement.setAttribute("data-theme", state.theme);
    document.documentElement.style.setProperty("--fs", state.fs + "px");
    savePrefs();
  }

  /* ---------- 工具 ---------- */
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function termsOf(query) {
    return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  }
  function highlight(text, terms) {
    var out = escapeHtml(text);
    if (!terms.length) return out;
    var re = new RegExp("(" + terms.map(escapeRegex).join("|") + ")", "g");
    return out.replace(re, "<mark>$1</mark>");
  }

  /* ---------- 模糊匹配 ---------- */
  function termMatches(term, hay) {
    if (hay.indexOf(term) !== -1) return true;
    var chars = term.split("");
    if (!chars.length) return false;
    var present = 0;
    chars.forEach(function (c) { if (hay.indexOf(c) !== -1) present++; });
    if (chars.length === 1) return present === 1;
    if (chars.length === 2) return present === 2;
    return present >= chars.length - 1;
  }
  function fuzzyMatch(terms, hay) {
    return terms.every(function (t) { return termMatches(t, hay); });
  }

  /* ---------- 方剂 ---------- */
  var formulaSorted = formulas.slice().sort(function (a, b) {
    var la = Math.max(a.name.length, a.alias ? a.alias.length : 0);
    var lb = Math.max(b.name.length, b.alias ? b.alias.length : 0);
    return lb - la;
  });
  function findFormulas(text) {
    var found = [];
    var work = text;
    formulaSorted.forEach(function (f) {
      var keys = [f.name];
      if (f.alias) keys.push(f.alias);
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k];
        if (work.indexOf(key) !== -1) {
          found.push(f);
          work = work.split(key).join("");
          break;
        }
      }
    });
    return found;
  }
  var entryFormulaCache = {};
  function formulasFor(entry) {
    if (entryFormulaCache[entry.book + entry.id]) return entryFormulaCache[entry.book + entry.id];
    var f = findFormulas(entry.text);
    entryFormulaCache[entry.book + entry.id] = f;
    return f;
  }
  function formulaHTML(f) {
    var herbs = f.herbs.map(function (h) { return h[0] + (h[1] ? " " + h[1] : ""); }).join("、");
    var html = '<div class="formula"><div class="formula-name">' + escapeHtml(f.name) + "</div>";
    if (herbs) html += '<div class="formula-row"><span class="fl">组成</span><span>' + escapeHtml(herbs) + "</span></div>";
    if (f.method) html += '<div class="formula-row"><span class="fl">煎服法</span><span>' + escapeHtml(f.method) + "</span></div>";
    if (f.caution) html += '<div class="formula-row caution"><span class="fl">注意</span><span>' + escapeHtml(f.caution) + "</span></div>";
    html += "</div>";
    return html;
  }
  function formulasHTML(entry) {
    var fs = formulasFor(entry);
    if (!fs.length) return "";
    return fs.map(formulaHTML).join("");
  }

  // 方剂名/别名 → 第一个出现的条文
  var formulaEntryMap = {};
  function formulaToEntry(name) {
    if (formulaEntryMap[name] !== undefined) return formulaEntryMap[name];
    var f = formulas.filter(function (x) { return x.name === name || x.alias === name; })[0];
    if (!f) { formulaEntryMap[name] = null; return null; }
    for (var i = 0; i < data.length; i++) {
      var fs = formulasFor(data[i]);
      if (fs.indexOf(f) !== -1) { formulaEntryMap[name] = data[i].id; return data[i].id; }
    }
    formulaEntryMap[name] = null;
    return null;
  }

  /* ---------- 分类 / 书 ---------- */
  function categoriesFor(book) {
    var seen = {};
    data.forEach(function (d) {
      if (book && d.book !== book) return;
      seen[d.category] = true;
    });
    return Object.keys(seen);
  }
  function buildBooks() {
    ["伤寒论", "金匮要略"].forEach(function (b) {
      var opt = document.createElement("option");
      opt.value = b; opt.textContent = b;
      bookEl.appendChild(opt);
    });
  }
  function renderCategories() {
    var cur = catEl.value;
    catEl.innerHTML = '<option value="">全部</option>';
    categoriesFor(state.book).forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c; opt.textContent = c;
      catEl.appendChild(opt);
    });
    catEl.value = (cur && categoriesFor(state.book).indexOf(cur) !== -1) ? cur : "";
    state.category = catEl.value;
  }

  /* ---------- 检索 ---------- */
  var entrySearchCache = {};
  function entrySearchText(e) {
    var key = e.book + e.id;
    if (entrySearchCache[key] !== undefined) return entrySearchCache[key];
    var parts = [e.id, e.book, e.chapter, e.category, e.text];
    formulasFor(e).forEach(function (f) {
      parts.push(f.name, f.alias || "", f.method, f.caution);
      f.herbs.forEach(function (h) { parts.push(h[0]); });
    });
    var s = parts.join("\n");
    entrySearchCache[key] = s;
    return s;
  }

  /* ---------- 症状 → 方剂 ---------- */
  function matchedSymptoms(terms) {
    var out = [];
    symptoms.forEach(function (s) {
      var hay = s.s + " " + (s.aliases || []).join(" ");
      if (terms.some(function (t) { return hay.indexOf(t) !== -1; })) out.push(s);
    });
    return out;
  }
  function renderSymptoms(terms) {
    symEl.innerHTML = "";
    var ms = matchedSymptoms(terms);
    if (!ms.length) { symEl.hidden = true; return; }
    symEl.hidden = false;
    var html = "";
    ms.forEach(function (s) {
      var chips = s.f.map(function (fn) {
        var eid = formulaToEntry(fn);
        return eid ? '<button class="chip" data-jump="' + eid + '">' + escapeHtml(fn) + "</button>"
                   : '<span class="chip plain">' + escapeHtml(fn) + "</span>";
      }).join("");
      html += '<div class="sym-group">' +
        '<div class="sym-name">' + escapeHtml(s.s) + "</div>" +
        '<div class="sym-chips">' + chips + "</div></div>";
    });
    symEl.innerHTML = '<div class="sym-head">症状 → 方剂</div>' + html;
  }

  /* ---------- 渲染列表 ---------- */
  function cardHTML(e, terms) {
    return (
      '<article class="entry" data-id="' + e.id + '" tabindex="0" role="button" aria-label="' + e.book + "第" + e.id + '条">' +
        '<div class="entry-head">' +
          '<span class="entry-no">' + e.id + "</span>" +
          '<span class="entry-book">' + escapeHtml(e.book) + "</span>" +
          '<span class="entry-cat">' + escapeHtml(e.category) + "</span>" +
        "</div>" +
        '<p class="entry-text">' + highlight(e.text, terms) + "</p>" +
        formulasHTML(e) +
      "</article>"
    );
  }

  function renderRead() {
    var terms = termsOf(state.query);
    renderSymptoms(terms);

    var filtered = data.filter(function (e) {
      if (state.book && e.book !== state.book) return false;
      if (state.category && e.category !== state.category) return false;
      if (!terms.length) return true;
      return fuzzyMatch(terms, entrySearchText(e));
    });

    var symCount = symEl.hidden ? 0 : matchedSymptoms(terms).length;
    metaEl.textContent = (symCount ? "症状 " + symCount + " 组 · " : "") + "条文 " + filtered.length + " 条";
    emptyEl.hidden = filtered.length > 0 || symCount > 0;
    listEl.innerHTML = "";

    if (!filtered.length) return;

    var html = "";
    var lastChapter = null, lastBook = null;
    filtered.forEach(function (e) {
      if (e.book !== lastBook) {
        html += '<h2 class="book-title">' + escapeHtml(e.book) + "</h2>";
        lastBook = e.book; lastChapter = null;
      }
      if (e.chapter !== lastChapter) {
        html += '<h3 class="chapter-title">' + escapeHtml(e.chapter) + "</h3>";
        lastChapter = e.chapter;
      }
      html += cardHTML(e, terms);
    });
    listEl.innerHTML = html;
  }

  /* ---------- 详情弹层 ---------- */
  function findIndexById(id) {
    for (var i = 0; i < data.length; i++) if (data[i].id === id) return i;
    return -1;
  }
  function contextHTML(entries, dir) {
    if (!entries.length) return "";
    var label = dir === "prev" ? "上文" : "下文";
    var items = entries.map(function (e) {
      return (
        '<button class="ctx-item" data-jump="' + e.id + '">' +
          '<span class="ctx-no">' + e.id + "</span>" +
          '<span class="ctx-body">' +
            '<span class="ctx-text">' + escapeHtml(e.text) + "</span>" +
            '<span class="ctx-formulas">' +
              formulasFor(e).map(function (f) { return '<em>' + escapeHtml(f.name) + "</em>"; }).join("") +
            "</span>" +
          "</span>" +
        "</button>"
      );
    }).join("");
    return '<div class="ctx-block"><div class="ctx-label">' + label + "</div>" + items + "</div>";
  }
  function openModal(id) {
    var i = findIndexById(id);
    if (i < 0) return;
    modalIndex = i;
    renderModal(i);
    modalEl.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeModal() {
    modalEl.hidden = true;
    document.body.style.overflow = "";
  }
  function renderModal(i) {
    var e = data[i];
    var prev = data.slice(Math.max(0, i - CONTEXT), i);
    var next = data.slice(i + 1, i + 1 + CONTEXT);

    var html =
      '<div class="detail-head">' +
        '<span class="entry-no big">' + e.id + "</span>" +
        '<span class="entry-book">' + escapeHtml(e.book) + "</span>" +
        '<span class="entry-cat">' + escapeHtml(e.category) + "</span>" +
      "</div>" +
      '<p class="detail-text">' + escapeHtml(e.text) + "</p>" +
      formulasHTML(e);

    if (prev.length || next.length) {
      html += '<div class="ctx-section">';
      html += contextHTML(prev, "prev");
      html += contextHTML(next, "next");
      html += "</div>";
    }

    html +=
      '<div class="detail-nav">' +
        '<button class="btn" data-act="prev"' + (i <= 0 ? " disabled" : "") + ">← 上一条</button>" +
        '<button class="btn" data-act="next"' + (i >= data.length - 1 ? " disabled" : "") + ">下一条 →</button>" +
      "</div>";

    modalBody.innerHTML = html;
    modalEl.scrollTop = 0;
  }
  function jumpFromModal(id) {
    var i = findIndexById(id);
    if (i < 0) return;
    modalIndex = i;
    renderModal(i);
    modalEl.scrollTop = 0;
  }

  /* ---------- 事件 ---------- */
  function bind() {
    searchEl.addEventListener("input", function () {
      state.query = searchEl.value;
      clearBtn.hidden = !state.query;
      renderRead();
    });
    clearBtn.addEventListener("click", function () {
      searchEl.value = ""; state.query = ""; clearBtn.hidden = true;
      renderRead(); searchEl.focus();
    });
    bookEl.addEventListener("change", function () {
      state.book = bookEl.value;
      renderCategories();
      renderRead();
    });
    catEl.addEventListener("change", function () {
      state.category = catEl.value; renderRead();
    });

    $("font-inc").addEventListener("click", function () { if (state.fs < 24) state.fs++; applyPrefs(); });
    $("font-dec").addEventListener("click", function () { if (state.fs > 14) state.fs--; applyPrefs(); });
    $("theme-btn").addEventListener("click", function () {
      var order = ["light", "sepia", "dark"];
      state.theme = order[(order.indexOf(state.theme) + 1) % order.length];
      applyPrefs();
    });
    $("back-top").addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    var progress = $("progress");
    var backTop = $("back-top");
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var doc = document.documentElement;
        var max = doc.scrollHeight - doc.clientHeight;
        var y = window.scrollY || doc.scrollTop || 0;
        progress.style.width = (max > 0 ? (y / max) * 100 : 0) + "%";
        backTop.hidden = y < 400;
        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    // 点击条目或症状方剂标签
    function jumpByClosest(ev) {
      var el = ev.target.closest("[data-jump]");
      if (el) openModal(parseInt(el.getAttribute("data-jump"), 10));
    }
    listEl.addEventListener("click", function (ev) {
      var entry = ev.target.closest(".entry");
      if (entry) { openModal(parseInt(entry.getAttribute("data-id"), 10)); return; }
      jumpByClosest(ev);
    });
    symEl.addEventListener("click", jumpByClosest);

    listEl.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      var el = ev.target.closest(".entry");
      if (el) { ev.preventDefault(); openModal(parseInt(el.getAttribute("data-id"), 10)); }
    });

    modalBody.addEventListener("click", function (ev) {
      var jump = ev.target.closest("[data-jump]");
      if (jump) { jumpFromModal(parseInt(jump.getAttribute("data-jump"), 10)); return; }
      var act = ev.target.closest("[data-act]");
      if (!act) return;
      var a = act.getAttribute("data-act");
      if (a === "prev" && modalIndex > 0) jumpFromModal(data[modalIndex - 1].id);
      else if (a === "next" && modalIndex < data.length - 1) jumpFromModal(data[modalIndex + 1].id);
    });
    modalEl.addEventListener("click", function (ev) {
      if (ev.target.getAttribute && ev.target.getAttribute("data-act") === "close") closeModal();
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && !modalEl.hidden) closeModal();
    });
  }

  function init() {
    loadPrefs();
    applyPrefs();
    buildBooks();
    renderCategories();
    bind();
    renderRead();
  }

  init();
})();
