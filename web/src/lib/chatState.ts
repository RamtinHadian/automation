/** Which colleague's conversation is open and visible right now; a new message from them is read at once, without a pop-up or sound. */
let activePeer = '';
export const setActiveChatPeer = (id: string) => {
  activePeer = id;
};
export const isChatOpenWith = (id?: string) => !!id && id === activePeer && typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus();
