export function stripRemoteFontImports(css) {
  return css.replace(/@import\s*(?:url\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\s*\)|"[^"]*"|'[^']*')\s*;/gi,
    (rule) => rule.includes('fonts.googleapis.com') ? '' : rule);
}
