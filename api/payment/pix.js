const https = require('https');

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

    // Get origin dynamically from request headers
    const origin = req.headers.origin || req.headers.referer || 'https://iabuilder.vercel.app';
    const cleanOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;

    // Create Preference Payload
    const preferenceData = JSON.stringify({
        items: [
            {
                title: 'IA Builder - Treinamento Online Completo',
                quantity: 1,
                currency_id: 'BRL',
                unit_price: 97.00
            }
        ],
        payer: {
            phone: {
                number: cleanWhatsapp
            }
        },
        back_urls: {
            success: `${cleanOrigin}/?payment_success=true&whatsapp=${cleanWhatsapp}`,
            failure: `${cleanOrigin}/?payment_failed=true`,
            pending: `${cleanOrigin}/?payment_pending=true`
        },
        auto_return: 'approved',
        payment_methods: {
            excluded_payment_types: [
                { id: 'ticket' } // Excludes Boleto to encourage Pix/Card instant conversion
            ],
            installments: 12 // Up to 12x parcelas
        }
    });

    const options = {
        hostname: 'api.mercadopago.com',
        path: '/checkout/preferences',
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${mpToken}`,
            'Content-Type': 'application/json'
        }
    };

    const createPreference = () => new Promise((resolve, reject) => {
        const request = https.request(options, (response) => {
            let data = '';
            response.on('data', chunk => { data += chunk; });
            response.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (response.statusCode >= 200 && response.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        reject(new Error(parsed.message || 'Mercado Pago Preference Error'));
                    }
                } catch (e) {
                    reject(new Error('Failed to parse Mercado Pago response'));
                }
            });
        });

        request.on('error', (err) => reject(err));
        request.write(preferenceData);
        request.end();
    });

    try {
        const mpResponse = await createPreference();
        
        return res.status(200).json({
            success: true,
            initPoint: mpResponse.init_point // The Mercado Pago Checkout Redirect URL
        });

    } catch (error) {
        console.error('Preference creation failed:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};
