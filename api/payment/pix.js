const https = require('https');

// Helper to generate a valid CPF (Mercado Pago requires a CPF for Pix)
function generateCPF() {
    const num = () => Math.floor(Math.random() * 9);
    const n = Array.from({ length: 9 }, num);
    
    let d1 = n.reduce((acc, val, idx) => acc + val * (10 - idx), 0);
    d1 = 11 - (d1 % 11);
    if (d1 >= 10) d1 = 0;
    n.push(d1);
    
    let d2 = n.reduce((acc, val, idx) => acc + val * (11 - idx), 0);
    d2 = 11 - (d2 % 11);
    if (d2 >= 10) d2 = 0;
    n.push(d2);
    
    return n.join('');
}

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { whatsapp } = req.body;
    if (!whatsapp) {
        return res.status(400).json({ success: false, error: 'WhatsApp number is required' });
    }

    const cleanWhatsapp = whatsapp.replace(/\D/g, '');
    const mpToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;

    if (!mpToken) {
        return res.status(500).json({ 
            success: false, 
            error: 'MERCADO_PAGO_ACCESS_TOKEN env variable not set on Vercel.' 
        });
    }

    const paymentData = JSON.stringify({
        transaction_amount: 97.00,
        description: 'IA Builder - Acesso Premium',
        payment_method_id: 'pix',
        payer: {
            email: `lead_${cleanWhatsapp}@iabuilder.com`,
            first_name: 'Leitor',
            last_name: 'IA Builder',
            identification: {
                type: 'CPF',
                number: generateCPF()
            }
        }
    });

    const options = {
        hostname: 'api.mercadopago.com',
        path: '/v1/payments',
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${mpToken}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': `idemp_${cleanWhatsapp}_${Date.now()}`
        }
    };

    // Promise wrapper for Mercado Pago API call
    const createMpPayment = () => new Promise((resolve, reject) => {
        const request = https.request(options, (response) => {
            let data = '';
            response.on('data', chunk => { data += chunk; });
            response.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (response.statusCode >= 200 && response.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        reject(new Error(parsed.message || 'Mercado Pago error'));
                    }
                } catch (e) {
                    reject(new Error('Failed to parse Mercado Pago response'));
                }
            });
        });

        request.on('error', (err) => reject(err));
        request.write(paymentData);
        request.end();
    });

    // Promise wrapper for Firebase update
    const saveToFirebase = (paymentId, payload) => new Promise((resolve, reject) => {
        const firebaseData = JSON.stringify(payload);
        const reqFirebase = https.request({
            hostname: 'iabuilder-8a7e7-default-rtdb.firebaseio.com',
            path: `/payments/${cleanWhatsapp}.json`,
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': firebaseData.length
            }
        }, (resFirebase) => {
            resFirebase.on('data', () => {});
            resFirebase.on('end', () => resolve());
        });

        reqFirebase.on('error', (err) => reject(err));
        reqFirebase.write(firebaseData);
        reqFirebase.end();
    });

    try {
        const mpResponse = await createMpPayment();
        const transactionData = mpResponse.point_of_interaction.transaction_data;
        const paymentId = mpResponse.id;

        const firebasePayload = {
            paymentId: paymentId,
            whatsapp: cleanWhatsapp,
            status: 'pending',
            amount: 97.00,
            createdAt: Date.now()
        };

        await saveToFirebase(paymentId, firebasePayload);

        return res.status(200).json({
            success: true,
            pixCode: transactionData.qr_code,
            qrCodeBase64: transactionData.qr_code_base64,
            paymentId: String(paymentId),
            amount: 97.00
        });

    } catch (error) {
        console.error('Pix generation failed:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};
