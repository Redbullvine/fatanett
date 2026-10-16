// Approved raster artwork, presentation only. These remain the original rank
// identifiers; decorative suits do not introduce new symbols or game rules.
const crops={J:[117,14],K:[584,14],Q:[1052,14],A:[117,520],'9':[584,520],'10':[1052,520]};
export function cardArtwork(rank){
  const crop=crops[rank];
  const sheet=rank==='A'?'luxe-western-black-spades-v5.png':rank==='9'?'luxe-western-black-clubs-v4.png':'luxe-western-gloss-v3.png';
  if(!crop)return rank;
  // Inner SVG clips the card independently of the responsive tile aspect ratio.
  // Cell height, reel pitch, motion and all engine identifiers remain unchanged.
  return `<svg class="rank-art premium-card" viewBox="0 0 368 470" aria-hidden="true" focusable="false"><svg width="368" height="470" viewBox="0 0 368 470" overflow="hidden"><image href="assets/cards/${sheet}" x="${-crop[0]}" y="${-crop[1]}" width="1536" height="1024"/></svg></svg>`;
}


