// SMOKE TEST: dapat mag-log at mag-toggle ang cards
document.addEventListener("DOMContentLoaded", () => {
  console.log("APP LOADED ✅");
  alert("app.js loaded ✅"); // dapat lumabas ito once

  const btnOwner = document.querySelector("#btnLoginOwner");
  const btnAdmin = document.querySelector("#btnLoginAdmin");
  const cardOwner = document.querySelector("#ownerLoginCard");
  const cardAdmin = document.querySelector("#adminLoginCard");

  [btnOwner, btnAdmin].forEach(b => b && (b.type = "button"));

  btnOwner?.addEventListener("click", (e) => {
    e.preventDefault();
    console.log("Owner button clicked");
    cardAdmin?.classList.add("hidden");
    cardOwner?.classList.remove("hidden");
  });

  btnAdmin?.addEventListener("click", (e) => {
    e.preventDefault();
    console.log("Admin button clicked");
    cardOwner?.classList.add("hidden");
    cardAdmin?.classList.remove("hidden");
  });
});