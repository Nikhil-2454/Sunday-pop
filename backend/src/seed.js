'use strict';
// SAMPLE DEVELOPMENT DATA ONLY. Prices, descriptions, ingredients and allergens are NOT verified.
// HSN and GST rate are deliberately left NULL: set them in Admin > Products after your tax professional confirms them.
const P = [
 ['classic-sea-salt','SP-CLS-001','Classic Sea Salt Popcorn','classic','Salty','#F3E2B3',9900],['golden-butter','SP-CLS-002','Golden Butter Popcorn','classic','Buttery','#F6D870',10900],
 ['sweet-caramel','SP-CLS-003','Sweet Caramel Popcorn','classic','Sweet','#DDB07F',11900],['dark-chocolate','SP-CLS-004','Dark Chocolate Popcorn','classic','Sweet','#8A5A3C',12900],
 ['matcha-inspired','SP-JPN-005','Matcha Inspired Popcorn','japanese','Earthy','#B7C98A',12900],['soy-sesame','SP-JPN-006','Soy & Sesame Popcorn','japanese','Savoury','#C9A66B',11900],
 ['wasabi-inspired','SP-JPN-007','Wasabi Inspired Popcorn','japanese','Spicy','#A9C27A',12900],['spicy-miso-inspired','SP-JPN-008','Spicy Miso Inspired Popcorn','japanese','Spicy','#D9873B',12900],
 ['smoked-chilli','SP-SIG-009','Smoked Chilli Popcorn','signature','Spicy','#C2553A',13900],['honey-sesame','SP-SIG-010','Honey Sesame Popcorn','signature','Sweet','#E3B95C',13900],
 ['sweet-and-spicy','SP-SIG-011','Sweet & Spicy Popcorn','signature','Sweet','#D9733E',13900],['ultimate-discovery-box','SP-SIG-012','Ultimate Discovery Box','signature','Mixed','#EADBC0',59900]];
function seed(db) {
  if (db.prepare('SELECT COUNT(*) c FROM products').get().c) return;
  const ins = db.prepare(`INSERT INTO products(slug,sku,name,category,flavour,colour,short_desc,description,price_paise,mrp_paise,weight_g,ingredients,allergens,stock,tags,popularity) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  P.forEach((p, i) => ins.run(p[0], p[1], p[2], p[3], p[4], p[5], `${p[4]} flavour (sample).`, 'SAMPLE DEVELOPMENT DESCRIPTION. Replace with verified product copy.', p[6], Math.round(p[6] * 1.1 / 100) * 100,
    p[0] === 'ultimate-discovery-box' ? 400 : 100, 'To be provided after product validation', 'To be provided after product validation', 100, `${p[3]},${p[4].toLowerCase()}`, 12 - i));
  db.prepare("INSERT OR IGNORE INTO coupons(code,kind,value,min_order_paise) VALUES('PREVIEW10','percent',10,0)").run();
  const st = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)');
  Object.entries({ legal_name: '', brand_name: 'SUNDAY POP', address: '', state: '', state_code: '', gst_registered: '0', gstin: '', invoice_prefix: 'INV-', invoice_seq: '0',
    ship_flat_paise: '4900', ship_free_above_paise: '49900', shipping_rate_bp: '', round_to_rupee: '0' }).forEach(([k, v]) => st.run(k, v));
}
module.exports = { seed };
if (require.main === module) { const c = require('./config')(); const db = require('./db').open(c.dbPath); seed(db); console.log('Seeded sample data into', c.dbPath); }
