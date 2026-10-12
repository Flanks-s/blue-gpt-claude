export const ROWS = [
  ['Stay','ALARM.','Intercom','SKY™','If','I’ll','Water','No','Keep','SPEAK'],
  ['close.','Surface','dead.','ENERGY','spoiled,','Stay','rising.','luck','in','SOFTLY'],
  ['Keep','unsafe.','Door','3940kJ','DISCARD.','Below.','Two','at','line.','WHEN'],
  ['everyone','ALL','jammed.','FAT','Don’t','You','children','Riverside.','Show','LIGHT'],
  ['ready—','to','Tunnel','55.5g','prepare','Go','upstairs.','Returning','your','ON.'],
  ['Behind!','Riverside','is','SERVE','unless','Ahead,','Battery','alone','wrist.','WATCH'],
  ['Mom,','School.','flooding,','500g','facing','Mother.','low.','and','Make','FOR'],
  ['go,','GO','go,','NET','IMMEDIATE','I','Room','dry.','some','ANY'],
  ['GO!','DOWN.','GO!','1g','DANGER.','Love—','8.','Over.','room.','FLICKERS.']
];
export const RAILS = [12,11,0,1,2,3,4,5,6,7,8,9];
export const SOLUTION = [
  {zone:12,column:8,letter:'H'}, {zone:12,column:5,letter:'E',authorDefined:true},
  {zone:11,column:4,letter:'M'}, {zone:12,column:1,letter:'A'},
  {zone:12,column:4,letter:'D'}, {zone:11,column:5,letter:'N'},
  {zone:12,column:5,letter:'E'}, {zone:0,column:2,letter:'S'}, {zone:0,column:2,letter:'S'}
];
export const LEGACY = [{zone:0,column:2,letter:'S'},{zone:0,column:3,letter:'T'},{zone:11,column:6,letter:'O'},{zone:11,column:7,letter:'P'},{zone:0,column:3,letter:'T'}];
export function decodePair(zone,column) {
  const bands={12:'ABCDEFGHI',11:'JKLMNOPQR',0:' STUVWXYZ'};
  if(!Number.isInteger(column)||column<1||column>9||!(zone in bands)) return '';
  return (bands[zone][column-1]||'').trim();
}
export function normalizeCode(value) { return String(value).normalize('NFKC').trim().toUpperCase().replace(/\s+/g,' '); }
export function isCorrectCode(value) {
  const v=normalizeCode(value);
  return v==='STOP THE MADNESS'||v==='HE MADNESS'||v==='HEMADNESS';
}
