import { createEffect, createSignal } from "solid-js";

const INPUT_BASE =
  "h-8 w-full rounded-xs border border-border bg-bg-primary px-2.5 text-[0.8125rem] text-text-primary outline-none transition-colors placeholder:text-text-placeholder focus:border-border-focused";

function FontInput(props: {
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = createSignal(props.value);

  createEffect(() => setDraft(props.value));

  const commit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    props.onCommit(trimmed);
  };

  return (
    <div class="flex flex-col gap-1.5">
      <input
        type="text"
        class={INPUT_BASE}
        style={{ "font-family": draft() }}
        value={draft()}
        placeholder={props.placeholder}
        onInput={(event) => setDraft(event.currentTarget.value)}
        onBlur={(event) => commit(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit(event.currentTarget.value);
            event.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}

export { FontInput, INPUT_BASE };
