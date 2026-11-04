exports.normalizePhone = value => {
  let s = String(value || '').replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d)).replace(/[^0-9+]/g, '');
  s = s.replace(/^\+?88/, '');
  return /^01[3-9]\d{8}$/.test(s) ? s : null;
};
exports.maskPhone = value => value ? `${value.slice(0,3)}****${value.slice(-4)}` : '';