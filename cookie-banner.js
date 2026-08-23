// UNEEK Cookie Consent Banner
// Ajoute <script src="/cookie-banner.js"></script> dans index.html (avant </body>)
// Stylé, GDPR-compliant, se souvient du choix via localStorage

(function () {
  if (localStorage.getItem("uneek_cookies") !== null) return;

  var css = document.createElement("style");
  css.textContent =
    "#ck-banner{position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#0A0A0A;color:#FAFAFA;padding:20px 28px;display:flex;align-items:center;justify-content:space-between;gap:16px;font-family:'DM Sans',sans-serif;font-size:13px;line-height:1.5;box-shadow:0 -4px 24px rgba(0,0,0,0.25);animation:ck-slide .4s ease}" +
    "@keyframes ck-slide{from{transform:translateY(100%)}to{transform:translateY(0)}}" +
    "#ck-banner a{color:#A3A3A3;text-decoration:underline}" +
    "#ck-banner a:hover{color:#FAFAFA}" +
    ".ck-btns{display:flex;gap:8px;flex-shrink:0}" +
    ".ck-btn{padding:9px 20px;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .15s}" +
    ".ck-accept{background:#FAFAFA;color:#0A0A0A}" +
    ".ck-accept:hover{background:#E5E5E5}" +
    ".ck-refuse{background:transparent;color:#A3A3A3;border:1px solid #525252}" +
    ".ck-refuse:hover{background:rgba(255,255,255,.06);color:#FAFAFA}" +
    "@media(max-width:600px){#ck-banner{flex-direction:column;text-align:center;padding:16px 20px}.ck-btns{width:100%;justify-content:center}}";
  document.head.appendChild(css);

  var banner = document.createElement("div");
  banner.id = "ck-banner";
  banner.innerHTML =
    '<span>Ce site utilise des cookies pour améliorer ton expérience. ' +
    '<a href="/privacy" target="_blank">En savoir plus</a></span>' +
    '<div class="ck-btns">' +
    '<button class="ck-btn ck-refuse" id="ck-refuse">Refuser</button>' +
    '<button class="ck-btn ck-accept" id="ck-accept">Accepter</button>' +
    "</div>";
  document.body.appendChild(banner);

  function close(val) {
    localStorage.setItem("uneek_cookies", val);
    banner.style.animation = "none";
    banner.style.transition = "transform .3s ease";
    banner.style.transform = "translateY(100%)";
    setTimeout(function () {
      banner.remove();
    }, 350);
  }

  document.getElementById("ck-accept").onclick = function () {
    close("accepted");
  };
  document.getElementById("ck-refuse").onclick = function () {
    close("refused");
  };
})();
