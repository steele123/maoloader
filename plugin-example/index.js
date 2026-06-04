/**
 * @description Shows a small maoloader example panel.
 * @author steel
 * @link https://github.com/steele123/maoloader
 */
(function () {
  const pluginName = "maoloader-example";
  const rootId = "maoloader-example-panel";
  const stylesheetId = "maoloader-example-styles";
  let pluginRoot = pluginName;

  function ensureStylesheet() {
    if (document.getElementById(stylesheetId)) {
      return;
    }

    const link = document.createElement("link");
    link.id = stylesheetId;
    link.rel = "stylesheet";
    link.href = `https://plugins/${pluginRoot}/styles.css`;
    document.head.appendChild(link);
  }

  function mount() {
    if (document.getElementById(rootId)) {
      return;
    }

    ensureStylesheet();

    const root = document.createElement("section");
    root.id = rootId;
    root.className = "maoloader-example-panel";
    root.innerHTML = `
      <div>
        <strong>maoloader plugin loaded</strong>
        <span>This example panel came from ${pluginName}.</span>
      </div>
      <button type="button" aria-label="Close example panel">Close</button>
    `;

    root.querySelector("button")?.addEventListener("click", () => {
      root.remove();
    });

    document.body.append(root);
  }

  exports.init = function init(context) {
    if (context?.meta?.name) {
      pluginRoot = context.meta.name;
    }
  };

  exports.load = mount;
})();
