// Approved raster artwork, presentation only. These remain the original rank
// identifiers; decorative suits do not introduce new symbols or game rules.
const crops={K:[72,12,434,546],Q:[551,5,472,553],J:[1042,7,450,551],A:[73,560,427,463],'9':[556,566,427,435],'10':[1071,559,377,464]};
export const SYMBOL_ART_NAMES={K:'Western King (K)',Q:'Ruby Queen (Q)',J:'One-eyed Jack (J)',A:'Onyx Spade (A)','9':'Onyx Club (9)','10':'Ruby Diamond (10)'};
export function cardArtwork(rank){
  const crop=crops[rank];
  const sheet='western-gem-symbols-v1.png';
  if(!crop)return rank;
  // Inner SVG clips the card independently of the responsive tile aspect ratio.
  // Cell height, reel pitch, motion and all engine identifiers remain unchanged.
  return `<svg class="rank-art gem-slot-art" viewBox="0 0 ${crop[2]} ${crop[3]}" aria-hidden="true" focusable="false"><svg width="${crop[2]}" height="${crop[3]}" viewBox="0 0 ${crop[2]} ${crop[3]}" overflow="hidden"><image href="assets/${sheet}" x="${-crop[0]}" y="${-crop[1]}" width="1536" height="1024"/></svg></svg>`;
}
