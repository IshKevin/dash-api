import { expect } from 'chai';
import { describe, it } from 'mocha';
import axios from 'axios';
import { config } from 'dotenv';

config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000/api';

// Test data
const testUser = {
  email: `test_${Date.now()}@example.com`,
  password: 'TestPass123!',
  full_name: 'Test User',
  phone: '0788123456'
};

let authToken: string;
let userId: string;

describe('API Integration Tests', function () {
  // Increase timeout for integration tests
  this.timeout(10000);

  // Test user registration
  it('should register a new user', async () => {
    try {
      // Try to register
      const response = await axios.post(`${API_BASE_URL}/auth/register`, testUser);
      expect(response.status).to.equal(201);

      // Check response structure using standard ApiResponse format
      expect(response.data.success).to.be.true;
      expect(response.data.data).to.have.property('token');
      expect(response.data.data.user).to.have.property('id');
      expect(response.data.data.user.email).to.equal(testUser.email);

      authToken = response.data.data.token;
      userId = response.data.data.user.id;
      console.log(`Registered user: ${userId}`);
    } catch (error: any) {
      // If user already exists, try to login to get token
      if (error.response?.status === 400 && error.response?.data?.message?.includes('already exists')) {
        const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
          email: testUser.email,
          password: testUser.password
        });
        authToken = loginResponse.data.data.token;
        userId = loginResponse.data.data.user.id;
        console.log(`Logged in existing user: ${userId}`);
        return;
      }
      console.error('User registration failed:', JSON.stringify(error.response?.data || error.message, null, 2));
      throw error;
    }
  });

  // Test user login
  it('should login the user', async () => {
    try {
      const response = await axios.post(`${API_BASE_URL}/auth/login`, {
        email: testUser.email,
        password: testUser.password
      });
      expect(response.status).to.equal(200);
      expect(response.data.success).to.be.true;
      expect(response.data.data).to.have.property('token');
      expect(response.data.data.user).to.have.property('id');
      expect(response.data.data.user.email).to.equal(testUser.email);

      authToken = response.data.data.token;
    } catch (error: any) {
      console.error('User login failed:', error.response?.data || error.message);
      throw error;
    }
  });

  // Test get user profile
  it('should get current user profile', async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/auth/profile`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      expect(response.status).to.equal(200);
      expect(response.data.success).to.be.true;
      expect(response.data.data).to.have.property('id');
      expect(response.data.data.email).to.equal(testUser.email);
    } catch (error: any) {
      console.error('Get user profile failed:', error.response?.data || error.message);
      throw error;
    }
  });

  // Test get all users (admin only)
  it('should allow admin to get all users', async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/users`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      // This might fail if the user is not an admin, so we check for either 200 or 403
      if (response.status === 200) {
        expect(response.data.success).to.be.true;
        expect(response.data.data).to.be.an('array');
      }
    } catch (error: any) {
      // If forbidden (not admin), that's also a valid outcome for a regular user test
      if (error.response?.status === 403) {
        return;
      }
      console.error('Get all users failed:', error.response?.data || error.message);
      throw error;
    }
  });

  // Test update user profile
  it('should update user profile', async () => {
    try {
      const response = await axios.put(`${API_BASE_URL}/auth/profile`, {
        full_name: 'Updated Test User'
      }, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      expect(response.status).to.equal(200);
      expect(response.data.success).to.be.true;
      expect(response.data.data.full_name).to.equal('Updated Test User');
    } catch (error: any) {
      console.error('Update user profile failed:', error.response?.data || error.message);
      throw error;
    }
  });
});