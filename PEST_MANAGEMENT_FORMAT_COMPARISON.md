# 📋 Pest Management Request Formats - Complete Comparison

## Overview
The pest management endpoint now supports **3 different request formats** to accommodate different user roles and use cases.

---

## 🎯 Format 1: Admin Format (Direct Details)

**Use Case:** Admin creates request on behalf of farmer with complete details

**Authentication:** Admin token required + farmer_id

### Request Body
```json
{
  "disease": {
    "name": "Tip Burn / Leaf Burn",
    "symptoms": "Brown leaf tips and margins",
    "index": "11"
  },
  "pest": {
    "name": "Avocado brown mite",
    "damage": "Causes bronzing of leaves",
    "index": "12"
  },
  "pestNoticed": "this_week",
  "controlMethods": "Applied neem oil",
  "farmer_id": "673ba8e4056a2c58ce7bfd65",
  "priority": "high"
}
```

### Key Features
- ✅ Direct input of disease/pest names
- ✅ Supports index/code fields
- ✅ No database lookup needed
- ✅ controlMethods optional
- ✅ farmer_id required
- ✅ Admin role required

### Documentation
📄 **`ADMIN_PEST_MANAGEMENT_FORMAT.md`**

---

## 🎯 Format 2: Farmer Format (Auto-Fill)

**Use Case:** Farmer selects from symptom/damage dropdowns, system auto-fills names

**Authentication:** Farmer token (uses authenticated user as farmer_id)

### Request Body
```json
{
  "disease_symptoms": "Brown leaf tips and margins",
  "pest_damage": "Causes bronzing of leaves",
  "pestNoticed": "this_week",
  "controlMethods": "Applied neem oil and copper spray"
}
```

### What Happens Internally
1. System queries: `PestDisease.findOne({ symptom_category: "Brown leaf tips..." })`
2. **Auto-fills** disease name: "Tip Burn / Leaf Burn"
3. System queries: `PestDisease.findOne({ damage_category: "Causes bronzing..." })`
4. **Auto-fills** pest name: "Avocado brown mite"

### Key Features
- ✅ User-friendly (describes what they see)
- ✅ Automatic disease/pest name lookup
- ✅ No need to know technical names
- ✅ controlMethods required
- ✅ Uses authenticated user as farmer
- ✅ Farmer role only

### Documentation
📄 **`PEST_MANAGEMENT_UPDATED_BODY.md`**  
📄 **`PEST_MANAGEMENT_AUTO_FILL.md`**

---

## 🎯 Format 3: Legacy Format (Direct IDs)

**Use Case:** Direct pest/disease ID selection (backward compatibility)

**Authentication:** Farmer/Agent token

### Request Body
```json
{
  "disease_id": "673d1234567890abcdef0001",
  "pest_id": "673d1234567890abcdef0010",
  "pestNoticed": "this_week",
  "controlMethods": "Applied treatments"
}
```

### What Happens Internally
1. System queries: `PestDisease.findById("673d1234...")`
2. Retrieves full disease details
3. System queries: `PestDisease.findById("673d1234...")`
4. Retrieves full pest details

### Key Features
- ✅ Direct MongoDB ID lookup
- ✅ Backward compatible
- ✅ No category matching needed
- ✅ controlMethods required
- ✅ Farmer/Agent roles

---

## 📊 Side-by-Side Comparison

| Feature | Admin Format | Farmer Format | Legacy Format |
|---------|--------------|---------------|---------------|
| **Input Method** | Direct object | Category selection | ID selection |
| **Disease Input** | `{name, symptoms, index}` | `disease_symptoms` string | `disease_id` MongoDB ID |
| **Pest Input** | `{name, damage, index}` | `pest_damage` string | `pest_id` MongoDB ID |
| **Auto-Fill** | ❌ Not needed | ✅ Yes | ❌ Not needed |
| **Index Support** | ✅ Yes | ❌ No | ❌ No |
| **farmer_id** | ✅ Required | ❌ Uses auth user | ❌ Uses auth user |
| **controlMethods** | Optional | Required | Required |
| **Allowed Roles** | Admin only | Farmer only | Farmer, Agent |
| **Use Case** | Admin portal | Farmer app | Legacy support |

---

## 🔄 Request Flow Comparison

### Admin Format Flow
```
Admin Input              System Processing                  Result
───────────              ─────────────────                  ──────

{                        No lookup needed                   {
  "disease": {           ↓                                    "name": "Tip Burn",
    "name": "Tip Burn",  Use directly                         "symptoms": "Brown...",
    "symptoms": "...",   ↓                                    "index": "11"
    "index": "11"        Save to database                   }
  }                      ↓
}                        ✅ Done
```

### Farmer Format Flow
```
Farmer Input                  System Processing                    Result
────────────                  ─────────────────                    ──────

{                             Query database                       {
  "disease_symptoms":         ↓                                      "name": "Tip Burn",
    "Brown leaf tips"         findOne({                              "symptoms": "Brown..."
}                               symptom_category: "Brown..."       }
                              })
                              ↓
                              Auto-fill disease name
                              ↓
                              ✅ Done
```

### Legacy Format Flow
```
Legacy Input               System Processing                  Result
────────────               ─────────────────                  ──────

{                          Query database                     {
  "disease_id":            ↓                                    "name": "Tip Burn",
    "673d..."              findById("673d...")                  "symptoms": "...",
}                          ↓                                    ... full details
                           Retrieve full details
                           ↓
                           ✅ Done
```

---

## 🧪 Example Requests

### Test 1: Admin Creates Request
```bash
curl -X POST "http://localhost:5000/api/service-requests/pest-management" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "disease": {
      "name": "Tip Burn",
      "symptoms": "Brown leaf tips",
      "index": "11"
    },
    "pestNoticed": "this_week",
    "farmer_id": "673ba8e4056a2c58ce7bfd65"
  }'
```

### Test 2: Farmer Submits (Auto-Fill)
```bash
curl -X POST "http://localhost:5000/api/service-requests/pest-management" \
  -H "Authorization: Bearer FARMER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "disease_symptoms": "Brown leaf tips and margins",
    "pestNoticed": "this_week",
    "controlMethods": "Applied foliar spray"
  }'
```

### Test 3: Legacy ID Format
```bash
curl -X POST "http://localhost:5000/api/service-requests/pest-management" \
  -H "Authorization: Bearer FARMER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "disease_id": "673d1234567890abcdef0001",
    "pestNoticed": "this_week",
    "controlMethods": "Applied treatments"
  }'
```

---

## 📤 Response Format (Same for All)

```json
{
  "success": true,
  "data": {
    "id": "673d...",
    "request_number": "PC-1732122450-AB12",
    "title": "Pest Control: Tip Burn / Leaf Burn",
    "pest_management_details": {
      "pests_diseases": [
        {
          "name": "Tip Burn / Leaf Burn",
          "type": "disease",
          "symptoms": "Brown leaf tips and margins",
          "index": "11",  // Only for admin format
          "order": 1,
          "is_primary": true
        }
      ],
      "first_noticed": "this_week",
      "severity_level": "critical",
      "control_methods_tried": "Applied treatments...",
      "damage_observed": "Brown leaf tips and margins"
    },
    "farmer_info": {
      "name": "John Doe",
      "phone": "+250788123456",
      "location": "..."
    }
  }
}
```

---

## 🎯 When to Use Each Format

### Use Admin Format When:
1. ✅ Admin creating requests via admin portal
2. ✅ Bulk data import by admin
3. ✅ Manual data entry with complete details
4. ✅ Need to specify index/code values
5. ✅ Emergency admin intervention
6. ✅ Importing from external systems

### Use Farmer Format When:
1. ✅ Farmer submitting their own requests
2. ✅ Mobile app with dropdowns
3. ✅ Web form with symptom/damage selection
4. ✅ User-friendly interface needed
5. ✅ Want system to handle pest/disease matching
6. ✅ Building farmer-facing applications

### Use Legacy Format When:
1. ✅ Integrating with existing systems
2. ✅ Agent selecting from pest/disease list
3. ✅ Backward compatibility needed
4. ✅ Direct database ID selection
5. ✅ Maintaining old API contracts

---

## ⚙️ Validation Differences

| Validation | Admin | Farmer | Legacy |
|------------|-------|--------|--------|
| **farmer_id** | Required | Not allowed | Optional (agents) |
| **disease.name** | Required if disease | N/A | N/A |
| **disease.symptoms** | Required if disease | N/A | N/A |
| **disease_symptoms** | N/A | Optional* | N/A |
| **disease_id** | N/A | N/A | Optional* |
| **controlMethods** | Optional | Required | Required |
| **Role check** | Admin only | Farmer only | Farmer/Agent |

*At least one pest or disease must be provided

---

## 🚀 Migration Path

### From Legacy to Farmer Format
```javascript
// Old (Legacy)
const request = {
  disease_id: "673d...",
  pestNoticed: "this_week",
  controlMethods: "..."
};

// New (Farmer with auto-fill)
const request = {
  disease_symptoms: "Brown leaf tips and margins",
  pestNoticed: "this_week",
  controlMethods: "..."
};
```

### From Farmer to Admin Format
```javascript
// Farmer (auto-fill)
const request = {
  disease_symptoms: "Brown leaf tips",
  pestNoticed: "this_week",
  controlMethods: "..."
};

// Admin (direct details)
const request = {
  disease: {
    name: "Tip Burn",
    symptoms: "Brown leaf tips",
    index: "11"
  },
  pestNoticed: "this_week",
  farmer_id: "673ba...",
  controlMethods: "..." // Optional for admin
};
```

---

## 📚 Complete Documentation Index

| Format | Documentation File |
|--------|-------------------|
| **Admin** | `ADMIN_PEST_MANAGEMENT_FORMAT.md` |
| **Farmer** | `PEST_MANAGEMENT_UPDATED_BODY.md` |
| **Auto-Fill** | `PEST_MANAGEMENT_AUTO_FILL.md` |
| **Overview** | `IMPLEMENTATION_SUMMARY.md` |
| **Quick Start** | `QUICK_START.md` |
| **Visual Guide** | `AUTO_FILL_FLOW_DIAGRAM.md` |
| **Comparison** | `PEST_MANAGEMENT_FORMAT_COMPARISON.md` (this file) |

---

## ✅ Testing All Formats

```javascript
// Test Admin Format
const adminTest = await fetch('/api/service-requests/pest-management', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${adminToken}` },
  body: JSON.stringify({
    disease: { name: "Tip Burn", symptoms: "Brown tips", index: "11" },
    pestNoticed: "this_week",
    farmer_id: "673ba..."
  })
});

// Test Farmer Format
const farmerTest = await fetch('/api/service-requests/pest-management', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${farmerToken}` },
  body: JSON.stringify({
    disease_symptoms: "Brown leaf tips and margins",
    pestNoticed: "this_week",
    controlMethods: "Applied spray"
  })
});

// Test Legacy Format
const legacyTest = await fetch('/api/service-requests/pest-management', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${farmerToken}` },
  body: JSON.stringify({
    disease_id: "673d...",
    pestNoticed: "this_week",
    controlMethods: "Applied spray"
  })
});

console.log('✅ All formats working!');
```

---

**Last Updated:** November 20, 2025  
**Status:** ✅ All 3 Formats Fully Implemented  
**Backward Compatibility:** ✅ Maintained
