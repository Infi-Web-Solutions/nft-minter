// test-pinata.js - Quick test script for your new credentials
import axios from 'axios';

// Your new credentials
const PINATA_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiJhNWMxMjFhMi1kYWQ3LTRkYjEtYjNmYy03NWQ3ZjNjMGQ2MWUiLCJlbWFpbCI6InZhbmRhbmF5YWRhdjAxNjNAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBpbl9wb2xpY3kiOnsicmVnaW9ucyI6W3siZGVzaXJlZFJlcGxpY2F0aW9uQ291bnQiOjEsImlkIjoiRlJBMSJ9LHsiZGVzaXJlZFJlcGxpY2F0aW9uQ291bnQiOjEsImlkIjoiTllDMSJ9XSwidmVyc2lvbiI6MX0sIm1mYV9lbmFibGVkIjpmYWxzZSwic3RhdHVzIjoiQUNUSVZFIn0sImF1dGhlbnRpY2F0aW9uVHlwZSI6InNjb3BlZEtleSIsInNjb3BlZEtleUtleSI6ImFmYTdmOTBkZjMwNDYxMzI5MTUyIiwic2NvcGVkS2V5U2VjcmV0IjoiZjRhY2JkNjFjNzFhNDY2Y2Q5YTI1ZWQ4M2NkNmE2MmFkMTMzYTFhNTkzMDhiMjdmZmMwMzU2OWJjZWM5N2ZhOCIsImV4cCI6MTc5MDQ4NDc0Nn0.iHXhVMhBLwjHA_YPbfUksqBbb2LsglpLWoVRUurzAQM';
const PINATA_API_KEY = 'afa7f90df30461329152';
const PINATA_SECRET = 'f4acbd61c71a466cd9a25ed83cd6a62ad133a1a59308b27ffc03569bcec97fa8';

async function testPinataCredentials() {
    console.log('Testing new Pinata credentials...');
    
    try {
        // Test JWT authentication
        console.log('\n1. Testing JWT authentication...');
        const jwtResponse = await axios.get('https://api.pinata.cloud/data/testAuthentication', {
            headers: {
                'Authorization': `Bearer ${PINATA_JWT}`
            },
            timeout: 10000
        });
        console.log('✅ JWT Authentication successful:', jwtResponse.data);
        
        // Test API Key authentication
        console.log('\n2. Testing API Key authentication...');
        const apiKeyResponse = await axios.get('https://api.pinata.cloud/data/testAuthentication', {
            headers: {
                'pinata_api_key': PINATA_API_KEY,
                'pinata_secret_api_key': PINATA_SECRET
            },
            timeout: 10000
        });
        console.log('✅ API Key Authentication successful:', apiKeyResponse.data);
        
        console.log('\n🎉 All credentials are working correctly!');
        console.log('You can now proceed with updating your backend environment file.');
        
    } catch (error) {
        console.error('\n❌ Credential test failed:');
        console.error('Status:', error.response?.status);
        console.error('Message:', error.response?.data || error.message);
        
        if (error.response?.status === 401) {
            console.log('\n💡 This usually means the credentials are invalid or expired.');
            console.log('Please check your Pinata dashboard and regenerate the keys if needed.');
        }
    }
}

// Run the test
testPinataCredentials();