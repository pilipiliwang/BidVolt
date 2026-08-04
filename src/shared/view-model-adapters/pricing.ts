import type { QuoteCalculation as ApiQuoteCalculation } from '../api/quotes';
import type {
  QuoteCalculationView,
  QuoteStrategy as QuoteStrategyView,
} from '../../domains/pricing/types';
import { assertNever } from './assert-never';
import { assertProjectSnapshotScope } from './scope';

type ApiCalculatedQuote = Extract<ApiQuoteCalculation, { status: 'calculated' }>;
type ApiQuoteStrategy = ApiCalculatedQuote['strategies'][number];
type ApiQuoteStrategyName = ApiQuoteStrategy['strategy'];
type ApiQuoteRiskLevel = ApiQuoteStrategy['risk_level'];

const strategyNameMap = {
  win: '中标优先',
  balance: '均衡方案',
  profit: '利润优先',
} satisfies Record<ApiQuoteStrategyName, string>;

const strategyDescriptionMap = {
  win: '偏向提高价格竞争力',
  balance: '在竞争力与利润之间保持平衡',
  profit: '在约束范围内优先保障利润',
} satisfies Record<ApiQuoteStrategyName, string>;

const riskLevelMap = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
} satisfies Record<ApiQuoteRiskLevel, string>;

function adaptStrategy(
  strategy: ApiQuoteStrategy,
  calculation: ApiCalculatedQuote,
): QuoteStrategyView {
  const basis = strategy.basis.length > 0 ? `；依据：${strategy.basis.join('、')}` : '';

  return {
    id: strategy.strategy_id,
    name: strategyNameMap[strategy.strategy],
    description: `${strategyDescriptionMap[strategy.strategy]}；${riskLevelMap[strategy.risk_level]}；毛利率 ${strategy.gross_margin}${basis}`,
    amount: strategy.suggested_price,
    currency: calculation.normalized_input.currency,
    confidenceLow: calculation.confidence_interval.min,
    confidenceHigh: calculation.confidence_interval.max,
    recommended: strategy.strategy === 'balance',
  };
}

function emptyQuoteView(
  calculation: Exclude<ApiQuoteCalculation, { status: 'calculated' }>,
): QuoteCalculationView {
  const querySnapshotId =
    'query_snapshot_id' in calculation && typeof calculation.query_snapshot_id === 'string'
      ? calculation.query_snapshot_id
      : '';

  return {
    id: calculation.calc_id,
    status: calculation.status,
    algorithmVersion: calculation.algorithm_version,
    sampleSnapshotId: '',
    querySnapshotId,
    message: calculation.message,
    strategies: [],
  };
}

export function adaptQuoteCalculation(
  calculation: ApiQuoteCalculation,
  expectedProjectSnapshotId: string,
): QuoteCalculationView {
  assertProjectSnapshotScope(expectedProjectSnapshotId, calculation.project_snapshot_id);

  switch (calculation.status) {
    case 'calculated':
      return {
        id: calculation.calc_id,
        status: calculation.status,
        algorithmVersion: calculation.algorithm_version,
        sampleSnapshotId: calculation.sample_snapshot_id,
        querySnapshotId: calculation.query_snapshot_id,
        strategies: calculation.strategies.map((strategy) => adaptStrategy(strategy, calculation)),
      };
    case 'needs_input':
      return emptyQuoteView(calculation);
    case 'insufficient_data':
      return emptyQuoteView(calculation);
    case 'constraint_violation':
      return emptyQuoteView(calculation);
    default:
      return assertNever(calculation, 'Unhandled quote calculation status');
  }
}
