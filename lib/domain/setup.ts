export const SETUP_STEPS = 3;

export type SetupStep = 1 | 2 | 3;

/** URL может открыть только уже достигнутый шаг, но не перепрыгнуть вперёд. */
export function resolveSetupStep(
  requestedStep: string | undefined,
  availableStep: SetupStep,
): SetupStep {
  const requested = Number(requestedStep);

  return Number.isInteger(requested) && requested >= 1 && requested <= availableStep
    ? (requested as SetupStep)
    : availableStep;
}
