import { expect } from 'chai';
import { describe, it } from 'mocha';
import { Request, Response } from 'express';
import { simpleAuth, simpleAdminOnly } from '../src/middleware/auth';

// Mock response object
const createMockResponse = () => {
  const res: any = {
    status: () => res,
    json: () => res,
  };
  return res as Response;
};

// Mock next function
const mockNext = () => {};

describe('Simple Authentication Middleware', () => {
  it('should reject requests without authorization header', () => {
    const req = {
      headers: {},
    } as Request;
    
    const res = createMockResponse();
    let statusCalled = false;
    let jsonCalled = false;
    
    res.status = (code: number) => {
      expect(code).to.equal(401);
      statusCalled = true;
      return res;
    };
    
    res.json = (data: any) => {
      expect(data.success).to.be.false;
      expect(data.message).to.equal('Access token is required');
      jsonCalled = true;
      return res;
    };
    
    simpleAuth(req, res, mockNext);
    
    expect(statusCalled).to.be.true;
    expect(jsonCalled).to.be.true;
  });

  it('should reject requests without Bearer token', () => {
    const req = {
      headers: {
        authorization: 'Basic someToken',
      },
    } as Request;
    
    const res = createMockResponse();
    let statusCalled = false;
    let jsonCalled = false;
    
    res.status = (code: number) => {
      expect(code).to.equal(401);
      statusCalled = true;
      return res;
    };
    
    res.json = (data: any) => {
      expect(data.success).to.be.false;
      expect(data.message).to.equal('Access token is required');
      jsonCalled = true;
      return res;
    };
    
    simpleAuth(req, res, mockNext);
    
    expect(statusCalled).to.be.true;
    expect(jsonCalled).to.be.true;
  });

  it('should accept requests with any Bearer token', () => {
    const req = {
      headers: {
        authorization: 'Bearer anyToken',
      },
    } as Request;
    
    const res = createMockResponse();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };
    
    simpleAuth(req, res, next);
    
    expect(nextCalled).to.be.true;
  });

  it('should accept requests from an authenticated admin using simpleAdminOnly', () => {
    const req = {
      user: { id: 'user-1', email: 'admin@example.com', role: 'admin', status: 'active' },
    } as unknown as Request;
    const res = createMockResponse();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    simpleAdminOnly(req, res, next);

    expect(nextCalled).to.be.true;
  });

  it('should reject requests from a non-admin user using simpleAdminOnly', () => {
    const req = {
      user: { id: 'user-2', email: 'farmer@example.com', role: 'farmer', status: 'active' },
    } as unknown as Request;
    const res = createMockResponse();
    let nextCalled = false;
    let statusCode: number | undefined;
    const next = () => {
      nextCalled = true;
    };
    res.status = (code: number) => {
      statusCode = code;
      return res;
    };

    simpleAdminOnly(req, res, next);

    expect(nextCalled).to.be.false;
    expect(statusCode).to.equal(403);
  });
});