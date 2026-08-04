import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { components } from './openapi.generated';
import {
  projectMaterialEventTypeSchema,
  projectMaterialRevisionSchema,
  requirementSchema,
} from './project-materials';
import {
  calculatedQuoteSchema,
  quoteCalculationSchema,
  quoteConstraintViolationSchema,
  quoteInsufficientDataSchema,
  quoteNeedsInputSchema,
} from './quotes';
import { reviewFindingSchema, reviewRunSchema } from './review';

type BidirectionallyEquivalent<Left, Right> = [Left] extends [Right]
  ? [Right] extends [Left]
    ? true
    : false
  : false;

type Assert<Condition extends true> = Condition;

type ContractParityAssertions = [
  Assert<
    BidirectionallyEquivalent<
      components['schemas']['QuoteCalculation']['status'],
      z.infer<typeof quoteCalculationSchema>['status']
    >
  >,
  Assert<
    BidirectionallyEquivalent<
      components['schemas']['ReviewRun']['status'],
      z.infer<typeof reviewRunSchema>['status']
    >
  >,
  Assert<
    BidirectionallyEquivalent<
      components['schemas']['ReviewFinding']['outcome'],
      z.infer<typeof reviewFindingSchema>['outcome']
    >
  >,
  Assert<
    BidirectionallyEquivalent<
      components['schemas']['ProjectMaterialRevision']['parse_status'],
      z.infer<typeof projectMaterialRevisionSchema>['parse_status']
    >
  >,
  Assert<
    BidirectionallyEquivalent<
      components['schemas']['ProjectMaterialRevision']['event_type'],
      z.infer<typeof projectMaterialEventTypeSchema>
    >
  >,
  Assert<
    BidirectionallyEquivalent<
      components['schemas']['Requirement']['type'],
      z.infer<typeof requirementSchema>['type']
    >
  >,
  Assert<
    BidirectionallyEquivalent<
      components['schemas']['Requirement']['status'],
      z.infer<typeof requirementSchema>['status']
    >
  >,
];

const contractParityAssertions: ContractParityAssertions = [
  true,
  true,
  true,
  true,
  true,
  true,
  true,
];

describe('OpenAPI generated types and handwritten Zod parity', () => {
  it('keeps selected enums bidirectionally equivalent at compile time', () => {
    expect(contractParityAssertions).toEqual(Array.from({ length: 7 }, () => true));
  });

  it('executes the corresponding runtime Zod literal branches', () => {
    expect([
      calculatedQuoteSchema.shape.status.parse('calculated'),
      quoteNeedsInputSchema.shape.status.parse('needs_input'),
      quoteInsufficientDataSchema.shape.status.parse('insufficient_data'),
      quoteConstraintViolationSchema.shape.status.parse('constraint_violation'),
    ]).toEqual(['calculated', 'needs_input', 'insufficient_data', 'constraint_violation']);

    expect(reviewRunSchema.shape.status.parse('invalid_response')).toBe('invalid_response');
    expect(reviewFindingSchema.shape.outcome.parse('abstain')).toBe('abstain');
    expect(projectMaterialEventTypeSchema.parse('clarification')).toBe('clarification');
    expect(projectMaterialRevisionSchema.shape.parse_status.parse('needs_review')).toBe(
      'needs_review',
    );
    expect(requirementSchema.shape.type.parse('reject_clause')).toBe('reject_clause');
    expect(requirementSchema.shape.status.parse('confirmed')).toBe('confirmed');
  });
});
