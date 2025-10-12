const request = require('supertest');
const app = require('../index');

jest.mock('../utils/mailSender', () => {
  return jest.fn(() => Promise.resolve({ accepted: ['test@example.com'] }));
});

const mailSender = require('../utils/mailSender');

describe('Basic API tests', () => {
  test('GET / should return server status', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('message');
  });

  test('POST /api/v1/reach/contact should send email and return success', async () => {
    const payload = {
      email: 'john@example.com',
      firstname: 'John',
      lastname: 'Doe',
      message: 'Hello from test',
      phoneNo: '1234567890',
      countrycode: '+91'
    };

    const res = await request(app).post('/api/v1/reach/contact').send(payload);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('message', expect.any(String));
    // ensure mailSender was called with correct args
    expect(mailSender).toHaveBeenCalled();
    const callArgs = mailSender.mock.calls[0];
    expect(callArgs[0]).toBe(payload.email);
  });
});
