interface EditableNameParts {
  editableName: string;
  preservedExtension: string | null;
}

function getPathName(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function getParentPath(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash !== -1 ? path.slice(0, lastSlash) : "";
}

function joinVaultPath(parentPath: string, name: string): string {
  return parentPath ? `${parentPath}/${name}` : name;
}

function splitNameForEditing(name: string, isDir: boolean): EditableNameParts {
  if (isDir || name.endsWith(".")) {
    return {
      editableName: name,
      preservedExtension: null,
    };
  }

  const lastDot = name.lastIndexOf(".");
  if (lastDot <= 0) {
    return {
      editableName: name,
      preservedExtension: null,
    };
  }

  return {
    editableName: name.slice(0, lastDot),
    preservedExtension: name.slice(lastDot),
  };
}

function buildNameFromEditable(
  editableName: string,
  preservedExtension: string | null | undefined,
): string {
  return `${editableName}${preservedExtension ?? ""}`;
}

function isSameOrDescendantPath(path: string, targetPath: string, isDir: boolean): boolean {
  if (path === targetPath) return true;
  return isDir && path.startsWith(`${targetPath}/`);
}

function remapMovedPath(path: string, from: string, to: string, isDir: boolean): string {
  if (path === from) {
    return to;
  }

  if (isDir && path.startsWith(`${from}/`)) {
    return `${to}${path.slice(from.length)}`;
  }

  return path;
}

function remapPathSet(
  paths: Iterable<string>,
  from: string,
  to: string,
  isDir: boolean,
): Set<string> {
  return new Set([...paths].map((path) => remapMovedPath(path, from, to, isDir)));
}

export {
  buildNameFromEditable,
  getParentPath,
  getPathName,
  isSameOrDescendantPath,
  joinVaultPath,
  remapMovedPath,
  remapPathSet,
  splitNameForEditing,
};
export type { EditableNameParts };
