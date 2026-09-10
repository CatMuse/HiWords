import { CanvasData, HiWordsSettings } from '../utils';
import { CanvasParser } from './canvas-parser';

// 固定布局参数
const BASE_X = 50;
const BASE_Y = 50;
const DEFAULT_CARD_WIDTH = 260;
const DEFAULT_CARD_HEIGHT = 120;
const GAP = 20;
const COLUMNS = 3;

/**
 * 简化的布局算法：使用固定参数的网格布局
 * - 左侧区域：3列固定网格（布局所有非分组节点：text 和 file）
 * - 保留 Mastered / 已掌握分组及其成员的位置
 * - 无复杂计算，位置可预测
 */
export function normalizeLayout(
  canvasData: CanvasData,
  settings: HiWordsSettings,
  parser: CanvasParser
) {
  if (!settings.autoLayoutEnabled) return;

  // 从设置中读取卡片尺寸，如果未设置则使用默认值
  const CARD_WIDTH = settings.cardWidth ?? DEFAULT_CARD_WIDTH;
  const CARD_HEIGHT = settings.cardHeight ?? DEFAULT_CARD_HEIGHT;

  const masteredGroup = canvasData.nodes.find(
    (n) => n.type === 'group' && (n.label === 'Mastered' || n.label === '已掌握')
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
