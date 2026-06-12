import type { ConversationWithTree } from '../schemas';

export interface FlatNode {
  node: ConversationWithTree;
  depth: number;
}

export function flattenTree(tree: ConversationWithTree, depth = 0): FlatNode[] {
  const items: FlatNode[] = [{ node: tree, depth }];
  for (const child of tree.children) {
    items.push(...flattenTree(child, depth + 1));
  }
  return items;
}

export function findNode(tree: ConversationWithTree, id: string): ConversationWithTree | null {
  if (tree.id === id) return tree;
  for (const child of tree.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

export function getPathToNode(tree: ConversationWithTree, id: string): ConversationWithTree[] {
  if (tree.id === id) return [tree];
  for (const child of tree.children) {
    const path = getPathToNode(child, id);
    if (path.length > 0) return [tree, ...path];
  }
  return [];
}

export function flattenSubtree(node: ConversationWithTree, depth = 0): FlatNode[] {
  const items: FlatNode[] = [{ node, depth }];
  for (const child of node.children) {
    items.push(...flattenSubtree(child, depth + 1));
  }
  return items;
}

export function countBranches(tree: ConversationWithTree): number {
  let count = tree.children.length > 0 ? 1 : 0;
  for (const child of tree.children) {
    count += countBranches(child);
  }
  return count;
}

export function getLeafNodes(tree: ConversationWithTree): ConversationWithTree[] {
  if (tree.children.length === 0) return [tree];
  const leaves: ConversationWithTree[] = [];
  for (const child of tree.children) {
    leaves.push(...getLeafNodes(child));
  }
  return leaves;
}

export function removeNode(tree: ConversationWithTree, id: string): ConversationWithTree | null {
  if (tree.id === id) return null;
  return {
    ...tree,
    children: tree.children
      .map((child) => removeNode(child, id))
      .filter((n): n is ConversationWithTree => n !== null),
  };
}
