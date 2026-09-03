import { basicSetup, EditorState, EditorView } from "codemirror";
import { yaml as yamlLanguage } from "@codemirror/lang-yaml";
import { linter, lintGutter } from "@codemirror/lint";
import { parseDocument } from "yaml";
import { compileSourceConfig, ConfigValidationError } from "../config-schema.js";

function pathSegments(path) {
  const result = [];
  const pattern = /([^.[\]]+)|\[(\d+)\]/g;
  for (const match of String(path ?? "").matchAll(pattern)) {
    result.push(match[2] != null ? Number(match[2]) : match[1]);
  }
  return result;
}

function rangeForPath(document, path, textLength) {
  try {
    const node = document.getIn(pathSegments(path), true);
    if (node?.range?.length >= 2) return { from: node.range[0], to: Math.max(node.range[0] + 1, node.range[1]) };
  } catch {
    // El path semántico puede apuntar a una clave ausente. En ese caso usamos el inicio.
  }
  return { from: 0, to: Math.min(Math.max(1, textLength), 1) };
}

export function validateYamlText(text) {
  const document = parseDocument(text, { prettyErrors: true, uniqueKeys: true, keepSourceTokens: true });
  if (document.errors.length) {
    const diagnostics = document.errors.map((error) => ({
      from: error.pos?.[0] ?? 0,
      to: Math.max((error.pos?.[0] ?? 0) + 1, error.pos?.[1] ?? (error.pos?.[0] ?? 0) + 1),
      severity: "error",
      message: error.message
    }));
    return { valid: false, config: null, diagnostics };
  }

  try {
    const raw = document.toJS({ maxAliasCount: 100 });
    const config = compileSourceConfig(raw);
    return { valid: true, config, diagnostics: [] };
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      const range = rangeForPath(document, error.path, text.length);
      return {
        valid: false,
        config: null,
        diagnostics: [{ ...range, severity: "error", message: error.message }]
      };
    }
    throw error;
  }
}

export function mountYamlEditor(container, { initialValue = "", onValidityChange = () => {} } = {}) {
  let lastResult = validateYamlText(initialValue);
  const runValidation = (text) => {
    lastResult = validateYamlText(text);
    onValidityChange(lastResult);
    return lastResult;
  };

  const state = EditorState.create({
    doc: initialValue,
    extensions: [
      basicSetup,
      yamlLanguage(),
      lintGutter(),
      linter((view) => validateYamlText(view.state.doc.toString()).diagnostics),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) runValidation(update.state.doc.toString());
      }),
      EditorView.theme({
        "&": { minHeight: "360px", maxHeight: "58vh", fontSize: "14px" },
        ".cm-scroller": { overflow: "auto", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }
      })
    ]
  });
  const view = new EditorView({ state, parent: container });
  onValidityChange(lastResult);

  return {
    getValue() {
      return view.state.doc.toString();
    },
    validate() {
      return runValidation(view.state.doc.toString());
    },
    get lastResult() {
      return lastResult;
    },
    focus() {
      view.focus();
    },
    destroy() {
      view.destroy();
    }
  };
}
