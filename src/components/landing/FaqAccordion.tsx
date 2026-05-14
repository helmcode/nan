import { useState } from 'preact/hooks';

export type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

interface Props {
  items: FaqItem[];
}

export default function FaqAccordion({ items }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  function toggle(id: string) {
    setOpenId((current) => (current === id ? null : id));
  }

  return (
    <ul class="divide-y divide-neutral-800/70 border-y border-neutral-800/70">
      {items.map((item) => {
        const isOpen = openId === item.id;
        const panelId = `faq-panel-${item.id}`;
        const buttonId = `faq-button-${item.id}`;
        return (
          <li key={item.id}>
            <button
              id={buttonId}
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => toggle(item.id)}
              class="w-full flex items-center justify-between gap-6 py-5 text-left text-sm md:text-base text-neutral-200 hover:text-white transition-colors"
            >
              <span class="font-mono">{item.question}</span>
              <span
                aria-hidden="true"
                class={`font-mono text-violet-400 text-lg transition-transform duration-300 ${
                  isOpen ? 'rotate-45' : ''
                }`}
              >
                +
              </span>
            </button>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              hidden={!isOpen}
              class="pb-5 pr-8 text-sm text-neutral-300 leading-relaxed"
            >
              {item.answer}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
