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

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { whatsapp } = req.query;
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

    // Promise wrapper to read from Firebase
    const getFirebasePayment = () => new Promise((resolve, reject) => {
        https.get(`https://iabuilder-8a7e7-default-rtdb.firebaseio.com/payments/${cleanWhatsapp}.json`, (response) => {
            let data = '';
            response.on('data', chunk => { data += chunk; });
            response.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(null);
                }
            });
        }).on('error', err => reject(err));
    });

    // Promise wrapper to query Mercado Pago payment status
    const queryMpPaymentStatus = (paymentId) => new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.mercadopago.com',
            path: `/v1/payments/${paymentId}`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${mpToken}`
            }
        };

        const request = https.request(options, (response) => {
            let data = '';
            response.on('data', chunk => { data += chunk; });
            response.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (response.statusCode >= 200 && response.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        reject(new Error(parsed.message || 'Mercado Pago query error'));
                    }
                } catch (e) {
                    reject(new Error('Failed to parse Mercado Pago response'));
                }
            });
        });

        request.on('error', err => reject(err));
        request.end();
    });

    // Promise wrapper to update Firebase status
    const updateFirebaseStatus = (status) => new Promise((resolve, reject) => {
        const updateData = JSON.stringify({ status });
        const reqFirebase = https.request({
            hostname: 'iabuilder-8a7e7-default-rtdb.firebaseio.com',
            path: `/payments/${cleanWhatsapp}.json`,
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': updateData.length
            }
        }, (resFirebase) => {
            resFirebase.on('data', () => {});
            resFirebase.on('end', () => resolve());
        });

        reqFirebase.on('error', err => reject(err));
        reqFirebase.write(updateData);
        reqFirebase.end();
    });

    try {
        const paymentRecord = await getFirebasePayment();
        if (!paymentRecord) {
            return res.status(200).json({ success: true, paid: false, message: 'No payment record found' });
        }

        if (paymentRecord.status === 'approved') {
            return res.status(200).json({ success: true, paid: true });
        }

        // If pending, check Mercado Pago API
        const mpDetails = await queryMpPaymentStatus(paymentRecord.paymentId);
        
        if (mpDetails.status === 'approved') {
            // Update status in Firebase
            await updateFirebaseStatus('approved');
            return res.status(200).json({ success: true, paid: true });
        }

        return res.status(200).json({ success: true, paid: false });

    } catch (error) {
        console.error('Status check failed:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};
