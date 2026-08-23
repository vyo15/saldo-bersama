export const EMPTY_COLLECTION_STATE = Object.freeze({
  CONTENT: "content",
  FILTERED: "filtered",
  INITIAL: "initial",
});

export const collectionEmptyState = ({ visibleCount = 0, totalCount = 0, filtersActive = false } = {}) => {
  if (Number(visibleCount) > 0) return EMPTY_COLLECTION_STATE.CONTENT;
  if (filtersActive || Number(totalCount) > 0) return EMPTY_COLLECTION_STATE.FILTERED;
  return EMPTY_COLLECTION_STATE.INITIAL;
};
