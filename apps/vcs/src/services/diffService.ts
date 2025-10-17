/**
 * Diff Service
 * Handles block-level diff calculation and three-way merging
 */

export interface Block {
  id: string;
  type: string;
  content: string;
  language?: string;
  [key: string]: any;
}

export interface BlockDiff {
  added: Block[];
  removed: Block[];
  modified: Array<{
    id: string;
    base: Block;
    current: Block;
  }>;
  unchanged: Block[];
}

export interface MergeResult {
  merged: Block[];
  conflicts: Array<{
    blockId: string;
    type: 'modify-modify' | 'modify-delete' | 'add-add';
    sourceContent: Block;
    targetContent: Block;
    baseContent: Block | null;
  }>;
  hasConflicts: boolean;
}

/**
 * Calculate diff between two block arrays
 */
export function calculateBlockDiff(
  sourceBlocks: Block[],
  targetBlocks: Block[]
): BlockDiff {
  const sourceMap = new Map(sourceBlocks.map(b => [b.id, b]));
  const targetMap = new Map(targetBlocks.map(b => [b.id, b]));

  const added: Block[] = [];
  const removed: Block[] = [];
  const modified: Array<{ id: string; base: Block; current: Block }> = [];
  const unchanged: Block[] = [];

  // Find added and modified blocks
  for (const targetBlock of targetBlocks) {
    const sourceBlock = sourceMap.get(targetBlock.id);

    if (!sourceBlock) {
      // Block exists in target but not in source = added
      added.push(targetBlock);
    } else {
      // Block exists in both - check if modified
      if (isBlockModified(sourceBlock, targetBlock)) {
        modified.push({
          id: targetBlock.id,
          base: sourceBlock,
          current: targetBlock,
        });
      } else {
        unchanged.push(targetBlock);
      }
    }
  }

  // Find removed blocks
  for (const sourceBlock of sourceBlocks) {
    if (!targetMap.has(sourceBlock.id)) {
      removed.push(sourceBlock);
    }
  }

  return { added, removed, modified, unchanged };
}

/**
 * Check if a block has been modified
 */
function isBlockModified(block1: Block, block2: Block): boolean {
  // Compare essential properties
  if (block1.type !== block2.type) return true;
  if (block1.content !== block2.content) return true;
  if (block1.language !== block2.language) return true;

  // Deep compare other properties (excluding id)
  const keys1 = Object.keys(block1).filter(k => k !== 'id');
  const keys2 = Object.keys(block2).filter(k => k !== 'id');

  if (keys1.length !== keys2.length) return true;

  for (const key of keys1) {
    if (JSON.stringify(block1[key]) !== JSON.stringify(block2[key])) {
      return true;
    }
  }

  return false;
}

/**
 * Three-way merge: Merge source and target blocks using base as common ancestor
 * This is the intelligent merge algorithm similar to Git
 */
export function threeWayMerge(
  baseBlocks: Block[],
  sourceBlocks: Block[],
  targetBlocks: Block[]
): MergeResult {
  console.log('[DiffService] Performing three-way merge');
  console.log(`  Base: ${baseBlocks.length} blocks`);
  console.log(`  Source: ${sourceBlocks.length} blocks`);
  console.log(`  Target: ${targetBlocks.length} blocks`);

  const baseMap = new Map(baseBlocks.map(b => [b.id, b]));
  const sourceMap = new Map(sourceBlocks.map(b => [b.id, b]));
  const targetMap = new Map(targetBlocks.map(b => [b.id, b]));

  const merged: Block[] = [];
  const conflicts: MergeResult['conflicts'] = [];
  const processedIds = new Set<string>();

  // Get all unique block IDs from all three versions
  const allIds = new Set([
    ...baseBlocks.map(b => b.id),
    ...sourceBlocks.map(b => b.id),
    ...targetBlocks.map(b => b.id),
  ]);

  for (const blockId of allIds) {
    const baseBlock = baseMap.get(blockId);
    const sourceBlock = sourceMap.get(blockId);
    const targetBlock = targetMap.get(blockId);

    processedIds.add(blockId);

    // Case 1: Block unchanged in both branches
    if (
      baseBlock &&
      sourceBlock &&
      targetBlock &&
      !isBlockModified(baseBlock, sourceBlock) &&
      !isBlockModified(baseBlock, targetBlock)
    ) {
      merged.push(targetBlock);
      continue;
    }

    // Case 2: Block only modified in source (not in target)
    if (
      baseBlock &&
      sourceBlock &&
      targetBlock &&
      isBlockModified(baseBlock, sourceBlock) &&
      !isBlockModified(baseBlock, targetBlock)
    ) {
      merged.push(sourceBlock); // Take source changes
      continue;
    }

    // Case 3: Block only modified in target (not in source)
    if (
      baseBlock &&
      sourceBlock &&
      targetBlock &&
      !isBlockModified(baseBlock, sourceBlock) &&
      isBlockModified(baseBlock, targetBlock)
    ) {
      merged.push(targetBlock); // Take target changes
      continue;
    }

    // Case 4: Block modified in both - CONFLICT!
    if (
      baseBlock &&
      sourceBlock &&
      targetBlock &&
      isBlockModified(baseBlock, sourceBlock) &&
      isBlockModified(baseBlock, targetBlock)
    ) {
      conflicts.push({
        blockId,
        type: 'modify-modify',
        sourceContent: sourceBlock,
        targetContent: targetBlock,
        baseContent: baseBlock,
      });
      // For now, use target version in merged (will be overwritten when conflict resolved)
      merged.push(targetBlock);
      continue;
    }

    // Case 5: Block added in source only
    if (!baseBlock && sourceBlock && !targetBlock) {
      merged.push(sourceBlock);
      continue;
    }

    // Case 6: Block added in target only
    if (!baseBlock && !sourceBlock && targetBlock) {
      merged.push(targetBlock);
      continue;
    }

    // Case 7: Block added in both - potential CONFLICT if different
    if (!baseBlock && sourceBlock && targetBlock) {
      if (isBlockModified(sourceBlock, targetBlock)) {
        conflicts.push({
          blockId,
          type: 'add-add',
          sourceContent: sourceBlock,
          targetContent: targetBlock,
          baseContent: null,
        });
        merged.push(targetBlock);
      } else {
        merged.push(targetBlock); // Same content, no conflict
      }
      continue;
    }

    // Case 8: Block deleted in source, modified in target - CONFLICT
    if (baseBlock && !sourceBlock && targetBlock && isBlockModified(baseBlock, targetBlock)) {
      conflicts.push({
        blockId,
        type: 'modify-delete',
        sourceContent: baseBlock, // Deleted version
        targetContent: targetBlock,
        baseContent: baseBlock,
      });
      merged.push(targetBlock);
      continue;
    }

    // Case 9: Block deleted in target, modified in source - CONFLICT
    if (baseBlock && sourceBlock && !targetBlock && isBlockModified(baseBlock, sourceBlock)) {
      conflicts.push({
        blockId,
        type: 'modify-delete',
        sourceContent: sourceBlock,
        targetContent: baseBlock, // Deleted version
        baseContent: baseBlock,
      });
      merged.push(sourceBlock);
      continue;
    }

    // Case 10: Block deleted in both
    if (baseBlock && !sourceBlock && !targetBlock) {
      // Deleted in both, don't add to merged
      continue;
    }

    // Case 11: Block deleted in source only
    if (baseBlock && !sourceBlock && targetBlock && !isBlockModified(baseBlock, targetBlock)) {
      // Deleted in source, unchanged in target - take deletion
      continue;
    }

    // Case 12: Block deleted in target only
    if (baseBlock && sourceBlock && !targetBlock && !isBlockModified(baseBlock, sourceBlock)) {
      // Deleted in target, unchanged in source - take deletion
      continue;
    }
  }

  console.log(`[DiffService] Merge result:`);
  console.log(`  Merged blocks: ${merged.length}`);
  console.log(`  Conflicts: ${conflicts.length}`);

  return {
    merged,
    conflicts,
    hasConflicts: conflicts.length > 0,
  };
}

/**
 * Format diff for display
 */
export function formatDiffForDisplay(diff: BlockDiff): string {
  let output = '=== Diff Summary ===\n\n';

  if (diff.added.length > 0) {
    output += `✅ Added (${diff.added.length}):\n`;
    diff.added.forEach(b => {
      output += `  + ${b.id}: ${b.type}\n`;
    });
    output += '\n';
  }

  if (diff.removed.length > 0) {
    output += `❌ Removed (${diff.removed.length}):\n`;
    diff.removed.forEach(b => {
      output += `  - ${b.id}: ${b.type}\n`;
    });
    output += '\n';
  }

  if (diff.modified.length > 0) {
    output += `✏️  Modified (${diff.modified.length}):\n`;
    diff.modified.forEach(m => {
      output += `  ~ ${m.id}: ${m.base.type}\n`;
    });
    output += '\n';
  }

  output += `📝 Unchanged (${diff.unchanged.length})\n`;

  return output;
}

/**
 * Apply a specific block resolution to merged blocks
 */
export function applyResolution(
  mergedBlocks: Block[],
  blockId: string,
  resolvedBlock: Block
): Block[] {
  const index = mergedBlocks.findIndex(b => b.id === blockId);

  if (index === -1) {
    // Block not in merged, add it
    return [...mergedBlocks, resolvedBlock];
  }

  // Replace the block at index
  const newBlocks = [...mergedBlocks];
  newBlocks[index] = resolvedBlock;
  return newBlocks;
}
