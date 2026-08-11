import { WizardShell } from "@/components/setup/wizard-shell";
import { StepMail } from "@/components/setup/step-mail";
import { StepOrganization } from "@/components/setup/step-organization";
import { StepSchedule } from "@/components/setup/step-schedule";
import { resolveSetupStep } from "@/lib/domain/setup";
import { catalogIsEmpty } from "@/lib/services/demo-catalog";
import { getSetupState } from "@/lib/services/setup";

export const dynamic = "force-dynamic";

const COPY = {
  1: {
    title: "Расскажите о салоне",
    description:
      "Название, часовой пояс и учётная запись администратора. Займёт меньше минуты.",
  },
  2: {
    title: "Когда вы работаете",
    description:
      "График мастера и правила записи. По ним система будет считать свободные слоты.",
  },
  3: {
    title: "Письма клиентам",
    description:
      "Напоминания о сеансе и ссылки для входа уходят по почте. Проверим, что она работает.",
  },
} as const;

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const [state, params] = await Promise.all([getSetupState(), searchParams]);
  const displayedStep = resolveSetupStep(params.step, state.step);
  const copy = COPY[displayedStep];

  return (
    <WizardShell step={displayedStep} title={copy.title} description={copy.description}>
      {displayedStep === 1 && (
        <StepOrganization
          organizationName={state.organizationName}
          timezone={state.timezone}
          adminName={state.adminName}
          adminEmail={state.adminEmail}
        />
      )}

      {displayedStep === 2 && (
        // В частном салоне администратор и мастер обычно один человек,
        // поэтому имя подставляется — но остаётся редактируемым.
        <StepSchedule
          defaults={{
            configured: state.step === 3,
            masterName: state.masterName ?? state.adminName ?? "",
            specialization: state.masterSpecialization ?? "",
            workingHours: state.workingHours,
            slotStepMinutes: state.step === 3 ? state.slotStepMinutes : 15,
            bufferMinutes: state.step === 3 ? state.bufferMinutes : 15,
            minLeadTimeMinutes: state.step === 3 ? state.minLeadTimeMinutes : 120,
            cancellationWindowHours: state.step === 3 ? state.cancellationWindowHours : 12,
            reminderOffsetMinutes: state.step === 3 ? state.reminderOffsetMinutes : 120,
            chargeSubscriptionOnNoShow:
              state.step === 3 ? state.chargeSubscriptionOnNoShow : true,
          }}
        />
      )}

      {displayedStep === 3 && (
        <StepMail
          adminEmail={state.adminEmail}
          catalogIsEmpty={await catalogIsEmpty()}
          fallbackMailMode={
            process.env.MAILPIT_SMTP_HOST
              ? "mailpit"
              : process.env.SMTP_HOST
                ? "environment"
                : null
          }
        />
      )}
    </WizardShell>
  );
}
