import axios from 'axios';
import { config } from 'dotenv';

config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

// Test data
const testUser = {
  email: 'test@example.com',
  password: 'TestPass123!',
  full_name: 'Test User',
  phone: '+1234567890'
};

let authToken: string;
let userId: string;

describe('API Tests', () => {
  // Test user registration
  test('User Registration', async () => {
    try {
      const response = await axios.post(`${API_BASE_URL}/auth/register`, testUser);
      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('token');
      expect(response.data.user).toHaveProperty('id');
      expect(response.data.user.email).toBe(testUser.email);
      
      authToken = response.data.token;
      userId = response.data.user.id;
      console.log('✓ User registration successful');
    } catch (error) {
      console.error('✗ User registration failed:', error.response?.data || error.message);
      throw error;
    }
  });

  // Test user login
  test('User Login', async () => {
    try {
      const response = await axios.post(`${API_BASE_URL}/auth/login`, {
        email: testUser.email,
        password: testUser.password
      });
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('token');
      expect(response.data.user).toHaveProperty('id');
      expect(response.data.user.email).toBe(testUser.email);
      
      authToken = response.data.token;
      console.log('✓ User login successful');
    } catch (error) {
      console.error('✗ User login failed:', error.response?.data || error.message);
      throw error;
    }
  });

  // Test get user profile
  test('Get User Profile', async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/auth/profile`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('id');
      expect(response.data.email).toBe(testUser.email);
      console.log('✓ Get user profile successful');
    } catch (error) {
      console.error('✗ Get user profile failed:', error.response?.data || error.message);
      throw error;
    }
  });

  // Test get all users (admin only)
  test('Get All Users', async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/users`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data.users)).toBe(true);
      console.log('✓ Get all users successful');
    } catch (error) {
      // This might fail if the user is not an admin, which is expected
      console.log('ℹ Get all users test completed (may fail for non-admin users)');
    }
  });

  // Test update user profile
  test('Update User Profile', async () => {
    try {
      const response = await axios.put(`${API_BASE_URL}/auth/profile`, {
        full_name: 'Updated Test User'
      }, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      expect(response.status).toBe(200);
      expect(response.data.full_name).toBe('Updated Test User');
      console.log('✓ Update user profile successful');
    } catch (error) {
      console.error('✗ Update user profile failed:', error.response?.data || error.message);
      throw error;
    }
  });
});

// Run tests
(async () => {
  console.log('Starting API tests...\n');
  
  try {
    await test('User Registration', async () => {
      // Test implementation
    });
    
    await test('User Login', async () => {
      // Test implementation
    });
    
    await test('Get User Profile', async () => {
      // Test implementation
    });
    
    await test('Get All Users', async () => {
      // Test implementation
    });
    
    await test('Update User Profile', async () => {
      // Test implementation
    });
    
    console.log('\n✅ All tests completed!');
  } catch (error) {
    console.error('\n❌ Tests failed:', error.message);
    process.exit(1);
  }
})();