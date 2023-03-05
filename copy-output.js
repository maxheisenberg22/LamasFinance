const fs = require('fs');

fs.copyFileSync('./target/types/lucky_spinner.ts', './idl/lucky_spinner.ts');
fs.copyFileSync('./target/types/jackport_lottery.ts', './idl/jackport_lottery.ts');
fs.copyFileSync('./target/types/up_or_down.ts', './idl/up_or_down.ts');
fs.copyFileSync('./target/types/price_predict.ts', './idl/price_predict.ts');
