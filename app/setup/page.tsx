import { WizardShell } from "@/components/setup/wizard-shell";
import { StepMail } from "@/components/setup/step-mail";
import { StepOrganization } from "@/components/setup/step-organization";
import { StepSchedule } from "@/components/setup/step-schedule";
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

export default async function SetupPage() {
  const state = await getSetupState();
  const copy = COPY[state.step];

  return (
    <WizardShell step={state.step} title={copy.title} description={copy.description}>
      {state.step === 1 && <StepOrganization />}

      {state.step === 2 && (
        // В частном салоне администратор и мастер обычно один человек,
        // поэтому имя подставляется — но остаётся редактируемым.
        <StepSchedule defaultMasterName={state.masterName ?? state.adminName ?? ""} />
      )}

      {state.step === 3 && (
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
