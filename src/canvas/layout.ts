import { CanvasData, CanvasNode, HiWordsSettings } from '../utils';
import { CanvasParser } from './canvas-parser';

// 固定布局参数
const BASE_X = 50;
const BASE_Y = 50;
const CARD_WIDTH = 260;
const CARD_HEIGHT = 120;
const GAP = 20;
const COLUMNS = 3;
const GROUP_PADDING = 24;
const GROUP_GAP = 12;
const GROUP_COLUMNS = 2;

/**
 * 简化的布局算法：使用固定参数的网格布局
 * - 左侧区域：3列固定网格（布局所有非分组节点：text 和 file）
 * - Mastered 分组内：2列固定网格
 * - 无复杂计算，位置可预测
 */
export function normalizeLayout(
  canvasData: CanvasData,
  settings: HiWordsSettings,
  parser: CanvasParser
) {
  if (!settings.autoLayoutEnabled) return;

  const masteredGroup = canvasData.nodes.find(
    (n) => n.type === 'group' && n.label === 'Mastered'
  );

  // 收集需要布局的节点（不在 Mastered 分组内的 text 和 file 节点）
  const movableNodes = canvasData.nodes.filter((n) => {
    if (n.type === 'group') return false; // 排除分组
    if (masteredGroup && parser.isNodeInGroup(n, masteredGroup)) return false;
    return true;
  });

  if (movableNodes.length === 0) return;

  // 简单网格布局
  for (let i = 0; i < movableNodes.length; i++) {
    const node = movableNodes[i];
    const col = i % COLUMNS;
    const row = Math.floor(i / COLUMNS);
    
    node.x = BASE_X + col * (CARD_WIDTH + GAP);
    node.y = BASE_Y + row * (CARD_HEIGHT + GAP);
    node.width = CARD_WIDTH;
    node.height = CARD_HEIGHT;
  }
}

/**
 * 分组内部布局：简单的固定列网格
 */
export function layoutGroupInner(
  canvasData: CanvasData,
  group: CanvasNode,
  settings: HiWordsSettings,
  parser: CanvasParser
) {
  const members = canvasData.nodes.filter(
    (n) => n.type !== 'group' && parser.isNodeInGroup(n, group)
  );
  
  if (members.length === 0) return;

  // 简单网格布局
  for (let i = 0; i < members.length; i++) {
    const node = members[i];
    const col = i % GROUP_COLUMNS;
    const row = Math.floor(i / GROUP_COLUMNS);
    
    node.x = group.x + GROUP_PADDING + col * (CARD_WIDTH + GROUP_GAP);
    node.y = group.y + GROUP_PADDING + row * (CARD_HEIGHT + GROUP_GAP);
    node.width = CARD_WIDTH;
    node.height = CARD_HEIGHT;
  }

  // 根据内容调整分组尺寸
  const rows = Math.ceil(members.length / GROUP_COLUMNS);
  const minWidth = GROUP_PADDING * 2 + GROUP_COLUMNS * CARD_WIDTH + (GROUP_COLUMNS - 1) * GROUP_GAP;
  const minHeight = GROUP_PADDING * 2 + rows * CARD_HEIGHT + (rows - 1) * GROUP_GAP;
  
  group.width = Math.max(group.width, minWidth);
  group.height = Math.max(group.height, minHeight);
}
