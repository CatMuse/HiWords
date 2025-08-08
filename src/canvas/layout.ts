import { CanvasData, CanvasNode, HiWordsSettings } from '../utils';
import { CanvasParser } from './canvas-parser';

/**
 * 规范化布局：
 * - 不移动 Mastered 分组内节点
 * - 保持 Mastered 分组垂直带及其右侧区域清空
 * - 将左侧区域的文本节点进行网格（Masonry 风格）布局，避免重叠
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

  const cardWidth = clamp(settings.cardWidth ?? 260, 120, 800);
  const cardHeight = clamp(settings.cardHeight ?? 120, 60, 800);
  const hGap = clamp(settings.horizontalGap ?? 24, 0, 200);
  const vGap = clamp(settings.verticalGap ?? 16, 0, 200);
  const leftPadding = clamp(settings.leftPadding ?? 24, 0, 400);
  const minLeftX = settings.minLeftX ?? 0;

  // 左侧区域可放置的最大X（受 Mastered 分组影响）
  let leftMaxX = Number.POSITIVE_INFINITY;
  if (masteredGroup) {
    leftMaxX = masteredGroup.x - leftPadding;
  }

  // 需要布局的节点：文本类型且不在 Mastered 分组内
  const movableNodes = canvasData.nodes.filter((n) => {
    if (n.type !== 'text') return false;
    if (masteredGroup && parser.isNodeInGroup(n, masteredGroup)) return false;
    return true;
  });

  if (movableNodes.length === 0) return;

  // 列计算
  const columnsAuto = settings.columnsAuto ?? true;
  let columns = clamp(settings.columns ?? 3, 1, settings.maxColumns ?? 6);

  // 以现有左侧可用宽度来动态估算列数
  if (columnsAuto) {
    const leftNodes = movableNodes;
    const minX = Math.min(...leftNodes.map((n) => n.x), minLeftX);
    const availableWidth = Math.max((leftMaxX - minX), cardWidth);
    const unit = cardWidth + hGap;
    columns = Math.max(1, Math.min(Math.floor((availableWidth + hGap) / unit), settings.maxColumns ?? 6));
  }

  // Masonry/网格布局
  // 先将目标区域内（左侧）的所有节点收集后，按 y/x 排序，逐个分配位置
  const sorted = movableNodes.slice().sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });

  // 列 x 坐标
  const baseX = Math.max(minLeftX, (function () {
    // 取左侧节点的最小 x 作为基准
    const leftNodes = sorted.length ? sorted : movableNodes;
    const minX = Math.min(...leftNodes.map((n) => n.x), minLeftX);
    return minX;
  })());

  const colX: number[] = [];
  for (let c = 0; c < columns; c++) {
    colX.push(baseX + c * (cardWidth + hGap));
  }

  const colY: number[] = new Array(columns).fill(sorted.length ? Math.min(...sorted.map(n => n.y)) : 0);

  for (const node of sorted) {
    // 选择当前最小的列进行放置（简单 Masonry）
    let bestCol = 0;
    let bestY = colY[0];
    for (let c = 1; c < columns; c++) {
      if (colY[c] < bestY) {
        bestY = colY[c];
        bestCol = c;
      }
    }

    node.x = colX[bestCol];
    node.y = bestY;
    node.width = node.width || cardWidth;
    node.height = node.height || cardHeight;

    colY[bestCol] = bestY + (node.height || cardHeight) + vGap;
  }
}

export function layoutGroupInner(
  canvasData: CanvasData,
  group: CanvasNode,
  settings: HiWordsSettings,
  parser: CanvasParser
) {
  // 将 Mastered 分组内的文本节点做简单网格布局，并可适当扩展分组尺寸
  const padding = clamp(settings.groupInnerPadding ?? 24, 0, 400);
  const gap = clamp(settings.groupInnerGap ?? 12, 0, 200);
  const columns = clamp(settings.groupInnerColumns ?? 2, 1, 8);
  const cardWidth = clamp(settings.cardWidth ?? 260, 120, 800);
  const cardHeight = clamp(settings.cardHeight ?? 120, 60, 800);

  const members = canvasData.nodes.filter(
    (n) => n.type === 'text' && parser.isNodeInGroup(n, group)
  );
  if (members.length === 0) return;

  let x = group.x + padding;
  let y = group.y + padding;
  let col = 0;

  for (const node of members) {
    node.x = x;
    node.y = y;
    node.width = node.width || cardWidth;
    node.height = node.height || cardHeight;

    col++;
    if (col >= columns) {
      col = 0;
      x = group.x + padding;
      y += (node.height || cardHeight) + gap;
    } else {
      x += (node.width || cardWidth) + gap;
    }
  }

  // 根据内容调整分组尺寸
  const maxRight = Math.max(...members.map((n) => n.x + (n.width || cardWidth)), group.x + 2 * padding + columns * cardWidth + (columns - 1) * gap);
  const maxBottom = Math.max(...members.map((n) => n.y + (n.height || cardHeight)), group.y + 2 * padding + Math.ceil(members.length / columns) * cardHeight + (Math.ceil(members.length / columns) - 1) * gap);

  group.width = Math.max(group.width, maxRight - group.x + padding);
  group.height = Math.max(group.height, maxBottom - group.y + padding);
}

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }
