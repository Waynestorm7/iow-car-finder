(function () {
  const GA_ID = "G-2Z69W9KDT7";
  const STORAGE_KEY = "iow_cookie_consent";

  function getChoice() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function saveChoice(choice) {
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch { }
  }

  function loadAnalytics() {
    if (window.iowAnalyticsLoaded) return;
    window.iowAnalyticsLoaded = true;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };

    window.gtag("js", new Date());
    window.gtag("config", GA_ID);

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GA_ID);
    document.head.appendChild(script);
  }

  function addStyles() {
    if (document.getElementById("cookieConsentStyles")) return;

    const style = document.createElement("style");
    style.id = "cookieConsentStyles";
    style.textContent = `
      .cookieConsent {
        position: fixed;
        left: 18px;
        right: 18px;
        bottom: 18px;
        z-index: 9999;
        background: #07111d;
        color: #fff;
        border: 1px solid rgba(255, 255, 255, .14);
        border-radius: 18px;
        box-shadow: 0 18px 50px rgba(0, 0, 0, .35);
        padding: 16px;
        max-width: 760px;
        margin: 0 auto;
        font-family: Arial, sans-serif;
      }

      .cookieConsentInner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }

      .cookieConsentText {
        margin: 0;
        font-size: .95rem;
        line-height: 1.45;
        color: rgba(255, 255, 255, .88);
      }

      .cookieConsentText strong {
        color: #fff;
      }

      .cookieConsentText a {
        color: #f6a04d;
        font-weight: 800;
        text-decoration: none;
      }

      .cookieConsentText a:hover {
        text-decoration: underline;
      }

      .cookieConsentActions {
        display: flex;
        gap: 10px;
        flex-shrink: 0;
      }

      .cookieConsent button {
        border: 0;
        border-radius: 999px;
        padding: 10px 14px;
        font-weight: 900;
        cursor: pointer;
        font-size: .9rem;
      }

      .cookieReject {
        background: rgba(255, 255, 255, .12);
        color: #fff;
      }

      .cookieAccept {
        background: #e67e22;
        color: #fff;
      }

      @media (max-width: 640px) {
        .cookieConsent {
          left: 12px;
          right: 12px;
          bottom: 12px;
          padding: 14px;
        }

        .cookieConsentInner {
          flex-direction: column;
          align-items: stretch;
        }

        .cookieConsentActions {
          display: grid;
          grid-template-columns: 1fr 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function showBanner() {
    if (document.getElementById("cookieConsent")) return;

    addStyles();

    const banner = document.createElement("div");
    banner.id = "cookieConsent";
    banner.className = "cookieConsent";
    banner.innerHTML = `
      <div class="cookieConsentInner">
        <p class="cookieConsentText">
          <strong>Cookies on IOW Car Finder.</strong>
          We use analytics cookies to understand website usage and improve the site.
          <a href="/cookie-policy">Cookie Policy</a>
        </p>

        <div class="cookieConsentActions">
          <button class="cookieReject" type="button">Reject</button>
          <button class="cookieAccept" type="button">Accept analytics</button>
        </div>
      </div>
    `;

    document.body.appendChild(banner);

    const rejectBtn = banner.querySelector(".cookieReject");
    const acceptBtn = banner.querySelector(".cookieAccept");

    rejectBtn.addEventListener("click", () => {
      saveChoice("rejected");
      banner.remove();
    });

    acceptBtn.addEventListener("click", () => {
      saveChoice("accepted");
      banner.remove();
      loadAnalytics();
    });
  }

  function initCookieConsent() {
    const choice = getChoice();

    if (choice === "accepted") {
      loadAnalytics();
      return;
    }

    if (choice === "rejected") {
      return;
    }

    showBanner();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCookieConsent);
  } else {
    initCookieConsent();
  }
})();