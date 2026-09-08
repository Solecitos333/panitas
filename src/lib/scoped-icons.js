import { createElement } from 'lucide';

// Lucide 0.468 createIcons ignores rootNode and replaces every SVG in the document.
// Only hydrate new placeholders in this region; keep existing buttons/SVGs intact.
export function createScopedIcons(icons, makeElement = createElement) {
  const templates = new Map();
  return function refresh(container) {
    if (!container) return;
    for (const placeholder of container.querySelectorAll('i[data-lucide]')) {
      const name = placeholder.getAttribute('data-lucide');
      const key = name.replace(/(^|[-_\s]+)(\w)/g, (_, separator, letter) => letter.toUpperCase());
      if (!icons[key]) continue;
      if (!templates.has(name)) templates.set(name, makeElement(icons[key]));
      const svg = templates.get(name).cloneNode(true);
      svg.setAttribute('aria-hidden', 'true');
      for (const attribute of Array.from(placeholder.attributes)) svg.setAttribute(attribute.name, attribute.value);
      svg.setAttribute('class', ['lucide', `lucide-${name}`, placeholder.getAttribute('class') || ''].join(' ').trim());
      placeholder.parentNode?.replaceChild(svg, placeholder);
    }
  };
}
