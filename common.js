// Small helpers shared by both games.
(function () {
  function toast(message, ms = 1800) {
    const wrap = document.getElementById("toasts");
    if (!wrap) return;
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    wrap.appendChild(el);
    setTimeout(() => {
      el.classList.add("out");
      setTimeout(() => el.remove(), 300);
    }, ms);
  }

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* storage unavailable; the game still works */
      }
    },
  };

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function sample(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // Remember the last `limit` ids so recent puzzles/categories aren't repeated.
  function recentList(key, limit) {
    return {
      has: (id) => store.get(key, []).includes(id),
      add(id) {
        const list = store.get(key, []).filter((x) => x !== id);
        list.push(id);
        store.set(key, list.slice(-limit));
      },
    };
  }

  function openModal(id) {
    document.getElementById(id).classList.add("open");
  }
  function closeModal(id) {
    document.getElementById(id).classList.remove("open");
  }

  async function share(text) {
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast("Copied results to clipboard");
    } catch {
      toast("Couldn't share results");
    }
  }

  window.Games = { toast, store, shuffle, sample, recentList, openModal, closeModal, share };
})();
