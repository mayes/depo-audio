export const MODES = [
  { id: 'stereo', label: 'Mix to Stereo',  desc: 'All channels blended to one stereo file' },
  { id: 'keep',   label: 'Keep Original',  desc: 'Convert container, preserve channel layout' },
  { id: 'split',  label: 'Split Channels', desc: 'One file per channel, named by role' },
]

export const FORMATS_OUT = [
  { id: 'wav',  label: 'WAV',  desc: 'Lossless PCM — editing' },
  { id: 'mp3',  label: 'MP3',  desc: '192 kbps — scopists / email' },
  { id: 'flac', label: 'FLAC', desc: 'Lossless compressed — archival' },
  { id: 'opus', label: 'Opus', desc: '64 kbps VBR — voice optimized, smallest' },
]

export const CH_COLORS = ['#c49a36','#4a8fdf','#3a9e6a','#c94e4e']

export const FORMAT_ROWS = [
  { ext: '.sgmca',                  vendor: 'Stenograph · Case CATalyst',          ch: '4 ch',   status: 'supported' },
  { ext: '.trm  .ftr',              vendor: 'For The Record · FTR Gold',            ch: '4–16 ch',status: 'experimental' },
  { ext: '.bwf',                    vendor: 'CourtSmart · Various',                 ch: 'varies', status: 'supported' },
  { ext: '.dm',                     vendor: 'Stenovations · DigitalCAT',            ch: '—',      status: 'experimental' },
  { ext: '.aes',                    vendor: 'Eclipse CAT · AudioSync',              ch: '—',      status: 'unsupported' },
  { ext: '.wav  .mp3  .wma  .m4a  .ogg  .opus  .flac  +more', vendor: 'Eclipse · ProCAT · StenoCAT · Standard', ch: 'any', status: 'supported' },
]
