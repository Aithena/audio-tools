import "./style.css";
import { mountMossTtsNano } from "./tools/moss-tts-nano.js";

const tools = [
  {
    id: "moss-tts-nano",
    name: "MOSS-TTS-Nano",
    mount: mountMossTtsNano,
  },
];

const app = document.querySelector("#app");
let unmount = null;

function render(activeId) {
  unmount?.();
  unmount = null;
  const active = tools.find((tool) => tool.id === activeId) ?? tools[0];

  app.innerHTML = `
    <div class="layout">
      <header class="topbar">
        <div class="brand">
          <span class="brand-mark">声音工具箱</span>
          <span class="brand-name"></span>
        </div>
        <nav class="menu">
          ${tools
            .map(
              (tool) => `
                <button
                  type="button"
                  class="menu-btn${tool.id === active.id ? " active" : ""}"
                  data-tool="${tool.id}"
                >${tool.name}</button>
              `,
            )
            .join("")}
        </nav>
      </header>
      <main class="workspace" id="workspace"></main>
    </div>
  `;

  app.querySelector(".menu").addEventListener("click", (event) => {
    const button = event.target.closest("[data-tool]");
    if (!button) return;
    const nextId = button.dataset.tool;
    if (nextId !== active.id) render(nextId);
  });

  unmount = active.mount(app.querySelector("#workspace")) || null;
}

render(tools[0].id);
