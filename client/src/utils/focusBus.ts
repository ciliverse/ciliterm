type InputFn = (data: string) => void;

let activeInput: InputFn | null = null;

/** Tracks the currently focused terminal so panels can inject text into it. */
export const focusBus = {
  setActiveInput(fn: InputFn | null) {
    activeInput = fn;
  },
  sendInput(data: string) {
    activeInput?.(data);
  },
  hasTarget() {
    return activeInput !== null;
  },
};
