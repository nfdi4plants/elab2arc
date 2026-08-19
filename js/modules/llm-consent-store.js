// Cloud LLM privacy consent — single source of truth (Zustand vanilla store)
//
// Previously, "current provider" and "consent granted" lived only in
// localStorage, and every piece of UI that needed to reflect them
// (the status checkbox next to the LLM provider dropdown, the review modal's
// checkbox/Accept button) was resynced by manually calling
// updateConsentStatusUI(provider) at each call site that changed something.
// That's exactly the class of bug that shipped: saveApiProvider() only
// resynced the status row *after* the async consent modal resolved, so while
// the modal was open deciding on a newly-selected provider, the status row
// behind it still showed the *previous* provider's (already-granted) consent
// as checked - a visibly contradictory pair of checkboxes on screen at once.
//
// Replacing the ad-hoc localStorage+manual-resync pattern with a store that
// every UI piece subscribes to removes that whole bug class structurally:
// there is exactly one place that changes "provider" or "consent", and every
// subscriber re-renders synchronously off the same state, so no call site can
// forget to keep some other element in sync.
import { createStore } from 'https://cdn.jsdelivr.net/npm/zustand@5/vanilla/+esm';

const CONSENT_GROUPS = ['together', 'community'];

function readStoredProvider() {
  return window.localStorage.getItem('llmApiProvider') || 'dataplan';
}

function readStoredConsent(group) {
  return window.localStorage.getItem(`llmCloudConsent_${group}`) === 'true';
}

const store = createStore((set) => ({
  provider: readStoredProvider(),
  consent: CONSENT_GROUPS.reduce((acc, group) => {
    acc[group] = readStoredConsent(group);
    return acc;
  }, {}),

  // Mirrors the <select>'s value into the store immediately (synchronously,
  // before any async consent-modal decision), so every subscriber re-renders
  // with the newly-selected provider's info right away - including while a
  // consent decision for that provider is still pending.
  setProvider(provider) {
    window.localStorage.setItem('llmApiProvider', provider);
    set({ provider });
  },

  // The one write path for consent (localStorage + reactive state together),
  // replacing the duplicated localStorage.setItem calls that used to live
  // inline in requestCloudLlmConsent().
  setConsent(group, granted) {
    window.localStorage.setItem(`llmCloudConsent_${group}`, granted ? 'true' : 'false');
    set((state) => ({ consent: { ...state.consent, [group]: granted } }));
  }
}));

window.Elab2ArcConsentStore = store;
