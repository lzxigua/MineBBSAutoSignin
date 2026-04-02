const fs = require('fs');
const wasmCode = fs.readFileSync('calc.wasm');
const Fingerprint2 = require('fingerprintjs2');
Fingerprint2.get(components => {
    const values = components.map(component => component.value);
    const murmur = Fingerprint2.x64hash128(values.join(''), 31);
    console.log(murmur);
});
function aa(e) {
    e = JSON.parse(e);
    WebAssembly.instantiate(wasmCode, {
        "env": {},
        "wasi_snapshot_preview1": {}
    }).then(result => {
        const instance = result.instance;
        const reset = instance.exports.reset;
        const arg = instance.exports.arg;
        const calc = instance.exports.calc;
        const ret = instance.exports.ret;
        aaaa = function() {
            return reset(),
            e.map(function(e) { return arg(e); }),
            Array(calc()).fill(-1).map(function() { return ret(); });
        }();
        console.log(JSON.stringify(aaaa));
    });
}
aa(process.argv[2]);