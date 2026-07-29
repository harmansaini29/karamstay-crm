/**
 * ==========================================
 * STATEFUL MOCK DATABASE (Offline Preview Mode)
 * ==========================================
 * Loaded ONLY when EXPO_PUBLIC_MOCK_API === 'true'.
 * Never imported in production paths.
 */

import { AxiosRequestConfig } from 'axios';

// ---------------------------------------------------------------------------
// Mutable mock state — intentionally module-scoped so mutations persist across
// calls within a single JS runtime session (mirrors a real stateful server).
// ---------------------------------------------------------------------------

export let mockUser: any = null;

export const mockProperties: any[] = [
  {
    id: 1,
    name: 'Karam Residency',
    address: 'Sector 62',
    property_type: 'apartment',
    city: 'Noida',
    state: 'Uttar Pradesh',
    pincode: '201301',
    is_active: true,
    latitude: 28.6282,
    longitude: 77.3898,
  },
  {
    id: 2,
    name: 'Karam Luxury Suites',
    address: 'DLF Phase 3',
    property_type: 'co-living',
    city: 'Gurugram',
    state: 'Haryana',
    pincode: '122002',
    is_active: true,
    latitude: 28.4907,
    longitude: 77.0803,
  },
];

export const mockUnits: any[] = [
  {
    id: 101,
    property_id: 1,
    building: 'Block A',
    floor: 3,
    unit_no: '302',
    unit_type: '2bhk',
    rent: 15000,
    deposit: 30000,
    status: 'occupied',
    capacity: 2,
    notes: 'Fitted with geyser.',
    latitude: 28.6282,
    longitude: 77.3898,
  },
  {
    id: 102,
    property_id: 1,
    building: 'Block A',
    floor: 1,
    unit_no: '101',
    unit_type: '1bhk',
    rent: 10000,
    deposit: 20000,
    status: 'vacant',
    capacity: 1,
    notes: 'Near staircase.',
    latitude: 28.6282,
    longitude: 77.3898,
  },
  {
    id: 201,
    property_id: 2,
    building: 'Wing B',
    floor: 5,
    unit_no: '505',
    unit_type: 'studio',
    rent: 18000,
    deposit: 36000,
    status: 'occupied',
    capacity: 2,
    notes: 'Balcony facing main road.',
    latitude: 28.4907,
    longitude: 77.0803,
  },
  {
    id: 202,
    property_id: 2,
    building: 'Wing B',
    floor: 0,
    unit_no: 'G-2',
    unit_type: 'room',
    rent: 8000,
    deposit: 16000,
    status: 'vacant',
    capacity: 1,
    notes: 'Wheelchair accessible.',
    latitude: 28.4907,
    longitude: 77.0803,
  },
];

export const mockBeds: any[] = [
  { id: 1, unit_id: 101, bed_no: 'Bed A', status: 'occupied' },
  { id: 2, unit_id: 101, bed_no: 'Bed B', status: 'vacant' },
  { id: 3, unit_id: 102, bed_no: 'Bed A', status: 'vacant' },
  { id: 4, unit_id: 201, bed_no: 'Bed A', status: 'occupied' },
  { id: 5, unit_id: 201, bed_no: 'Bed B', status: 'occupied' },
  { id: 6, unit_id: 202, bed_no: 'Bed A', status: 'vacant' },
];

export const mockTenants: any[] = [
  {
    id: 1,
    user_id: 10,
    name: 'John Doe',
    phone: '+919999988888',
    email: 'john@example.com',
    date_of_birth: '1995-05-15',
    occupation: 'Software Engineer',
    emergency_contact_name: 'Jane Doe',
    emergency_contact_phone: '+919999988887',
    status: 'active',
    owner_notes: 'Responsible tenant.',
  },
  {
    id: 2,
    user_id: 11,
    name: 'Aarav Sharma',
    phone: '+919876543210',
    email: 'aarav@example.com',
    date_of_birth: '1998-10-20',
    occupation: 'Student',
    emergency_contact_name: 'Raj Sharma',
    emergency_contact_phone: '+919876543211',
    status: 'active',
    owner_notes: 'College student.',
  },
];

export const mockTenancies: any[] = [
  {
    id: 1,
    tenant_id: 1,
    unit_id: 101,
    bed_ids: [1],
    start_date: '2026-01-01',
    end_date: null,
    move_out_date: null,
    monthly_rent: 15000,
    security_deposit: 30000,
    billing_day: 1,
    status: 'active',
  },
  {
    id: 2,
    tenant_id: 2,
    unit_id: 201,
    bed_ids: [4, 5],
    start_date: '2026-03-15',
    end_date: null,
    move_out_date: null,
    monthly_rent: 18000,
    security_deposit: 36000,
    billing_day: 15,
    status: 'active',
  },
];

export const mockInvoices: any[] = [
  {
    id: 501,
    tenancy_id: 1,
    billing_period: '2026-06',
    due_date: '2026-07-05',
    amount: 15000,
    late_fee_amount: 250,
    status: 'overdue',
  },
  {
    id: 502,
    tenancy_id: 2,
    billing_period: '2026-06',
    due_date: '2026-07-15',
    amount: 18000,
    late_fee_amount: 0,
    status: 'pending',
  },
  {
    id: 503,
    tenancy_id: 1,
    billing_period: '2026-05',
    due_date: '2026-06-05',
    amount: 15000,
    late_fee_amount: 0,
    status: 'paid',
  },
];

export const mockPayments: any[] = [
  {
    id: 601,
    invoice_id: 503,
    tenancy_id: 1,
    amount: 15000,
    payment_type: 'rent',
    mode: 'upi',
    status: 'captured',
    paid_at: '2026-06-03T10:15:30Z',
    utr_number: '123456789012',
    submitted_at: '2026-06-03T10:00:00Z',
    verified_by_id: 1,
    verified_at: '2026-06-03T10:15:30Z',
    rejection_reason: null,
  },
];

export const mockLedger: any[] = [
  {
    id: 701,
    tenancy_id: 1,
    payment_id: null,
    entry_type: 'security_deposit',
    direction: 'debit',
    amount: 30000,
    occurred_on: '2026-01-01',
    description: 'Security deposit due on check-in',
  },
  {
    id: 702,
    tenancy_id: 1,
    payment_id: null,
    entry_type: 'rent',
    direction: 'debit',
    amount: 15000,
    occurred_on: '2026-01-01',
    description: 'First month rent due on check-in',
  },
  {
    id: 703,
    tenancy_id: 1,
    payment_id: 601,
    entry_type: 'rent_payment',
    direction: 'credit',
    amount: 15000,
    occurred_on: '2026-06-03',
    description: 'Rent payment for period 2026-05',
  },
];

export const mockExpenses: any[] = [
  {
    id: 801,
    property_id: 1,
    category: 'Repairs',
    amount: 2400,
    expense_date: '2026-06-12',
    description: 'Fitted geyser in Unit 302',
    receipt_document_id: null,
  },
  {
    id: 802,
    property_id: 1,
    category: 'Electricity Bill',
    amount: 8500,
    expense_date: '2026-07-01',
    description: 'Common area power bill',
    receipt_document_id: null,
  },
];

export const mockNotifications: any[] = [
  {
    id: 901,
    channel: 'push',
    notification_type: 'rent_reminder',
    title: 'Rent Invoice Generated',
    message: 'Invoice for period 2026-06 has been posted.',
    status: 'unread',
    sent_at: '2026-07-01T08:00:00Z',
    created_at: '2026-07-01T08:00:00Z',
  },
  {
    id: 902,
    channel: 'whatsapp',
    notification_type: 'general_notice',
    title: 'Water Line Repair',
    message: 'Water supply will be suspended for maintenance from 2 PM to 4 PM today.',
    status: 'read',
    sent_at: '2026-07-05T09:30:00Z',
    created_at: '2026-07-05T09:30:00Z',
  },
];

export const mockDocs: any[] = [
  {
    id: 950,
    tenant_id: 1,
    property_id: 1,
    document_type: 'lease_agreement',
    file_name: 'lease_agreement_doe.pdf',
    content_type: 'application/pdf',
    status: 'approved',
    rejection_reason: null,
    created_at: '2026-01-01T09:00:00Z',
  },
];

// ---------------------------------------------------------------------------
// Agreement Engine data
// ---------------------------------------------------------------------------
export const mockAgreements: any[] = [
  {
    id: 1,
    tenancy_id: 1,
    tenant_id: 1,
    template_id: 'A',
    template_name: 'Standard Agreement',
    status: 'approved',   // form_submitted | docx_generated | offline_pending | approved
    form_data: {
      full_name: 'John Doe',
      age: '30',
      identity_number: '****-****-8888', // masked
      phone: '+919999988888',
      emergency_contact: 'Jane Doe / +919999988887',
      permanent_address: '12 Main Street, Delhi',
      office_address: 'Block A, Tech Park, Noida',
      digital_signature: 'data:image/png;base64,MOCK_SIG',
    },
    docx_file_name: 'agreement_john_doe_2026-01.docx',
    docx_generated_at: '2026-01-02T10:00:00Z',
    tracker_stage: 4,  // 1=submitted 2=docx_generated 3=offline_pending 4=approved
    created_at: '2026-01-01T09:00:00Z',
  },
];

export const mockAgreementUploads: any[] = [
  {
    id: 1,
    agreement_id: 1,
    upload_type: 'stamp_paper',   // stamp_paper | police_noc | notary_stamp
    file_name: 'stamp_paper_doe.jpg',
    status: 'APPROVED',           // PENDING | STAMPED | NOTARIZED | APPROVED
    notes: 'Stamp paper verified.',
    uploaded_at: '2026-01-03T11:00:00Z',
  },
];

export const mockStaff: any[] = [
  {
    id: 201,
    name: 'Rohan Verma',
    email: 'rohan.staff@karamstay.com',
    phone: '+919876500001',
    role: { id: 5, name: 'staff' },
    is_active: true,
    assigned_properties: [1],
    created_at: '2026-02-01T09:00:00Z',
  },
  {
    id: 202,
    name: 'Priya Nair',
    email: 'priya.staff@karamstay.com',
    phone: '+919876500002',
    role: { id: 5, name: 'staff' },
    is_active: true,
    assigned_properties: [1, 2],
    created_at: '2026-03-10T09:00:00Z',
  },
];

export const mockConsents: any[] = [
  {
    user_id: 10,
    consent_type: 'primary_data',
    granted: true,
    policy_version: '1.0',
    created_at: '2026-01-01T09:00:00Z',
  },
  {
    user_id: 10,
    consent_type: 'whatsapp_notifications',
    granted: true,
    policy_version: '1.0',
    created_at: '2026-01-01T09:00:00Z',
  },
  {
    user_id: 10,
    consent_type: 'push_notifications',
    granted: false,
    policy_version: '1.0',
    created_at: '2026-01-01T09:00:00Z',
  },
];

export const mockSettings = {
  late_fee_grace_days: 5,
  late_fee_percent_per_day: 0.5,
  brand_name: 'KaramStay Co.',
  whatsapp_otp_template: 'otp_template',
  whatsapp_payment_confirmation_template: 'pay_confirm',
  whatsapp_generic_notice_template: 'notice_broadcast',
  owner_upi_vpa: 'karamstay@okhdfcbank',
  payee_name: 'Karam Singh',
  grievance_officer_name: 'Karam Singh',
  grievance_officer_email: 'grievance@karamstay.com',
  grievance_officer_phone: '+919999911111',
};

// ---------------------------------------------------------------------------
// Mock request router — handles all API paths and returns { data, status }.
// ---------------------------------------------------------------------------

export const handleMockRequest = async (
  config: AxiosRequestConfig
): Promise<{ data: any; status: number }> => {
  const method = config.method?.toLowerCase() || 'get';
  const url = config.url || '';

  // Simulate server latency
  await new Promise((resolve) => setTimeout(resolve, 300));

  // --- AUTH ---
  if (url === '/auth/login' && method === 'post') {
    const { email } = JSON.parse(config.data || '{}');
    const roleName = email?.includes('accountant')
      ? 'accountant'
      : email?.includes('manager')
      ? 'manager'
      : email?.includes('staff')
      ? 'staff'
      : 'owner';
    mockUser = {
      id: 1,
      name: email?.split('@')[0]?.toUpperCase() || 'ADMIN',
      email: email || 'owner@karamstay.com',
      phone: '+919999911111',
      is_active: true,
      role: { id: roleName === 'staff' ? 5 : 1, name: roleName },
    };
    return {
      data: {
        access_token: 'mock_access_token',
        refresh_token: 'mock_refresh_token',
        token_type: 'bearer',
      },
      status: 200,
    };
  }

  if (url === '/auth/otp/request' && method === 'post') {
    return { data: { message: 'OTP sent successfully' }, status: 200 };
  }

  if (url === '/auth/otp/verify' && method === 'post') {
    const { phone } = JSON.parse(config.data || '{}');
    mockUser = {
      id: 10,
      name: 'Tenant User',
      email: 'tenant@karamstay.com',
      phone: phone || '+919999988888',
      is_active: true,
      role: { id: 4, name: 'tenant' },
    };
    return {
      data: {
        access_token: 'mock_access_token',
        refresh_token: 'mock_refresh_token',
        token_type: 'bearer',
      },
      status: 200,
    };
  }

  if (url === '/auth/me' && method === 'get') {
    if (!mockUser) {
      mockUser = {
        id: 1,
        name: 'Karam Owner',
        email: 'owner@karamstay.com',
        phone: '+919999911111',
        is_active: true,
        role: { id: 1, name: 'owner' },
      };
    }
    return { data: mockUser, status: 200 };
  }

  if (url === '/auth/logout' && method === 'post') {
    mockUser = null;
    return { data: {}, status: 204 };
  }

  // --- PROPERTIES ---
  if (url === '/properties' && method === 'get') {
    return { data: mockProperties, status: 200 };
  }

  if (url === '/properties' && method === 'post') {
    const body = JSON.parse(config.data || '{}');
    const newProperty = {
      id: mockProperties.length + 1,
      latitude: 28.6282,
      longitude: 77.3898,
      ...body,
      is_active: true,
    };
    mockProperties.push(newProperty);
    return { data: newProperty, status: 201 };
  }

  const propertyMatch = url.match(/^\/properties\/(\d+)$/);
  if (propertyMatch) {
    const id = parseInt(propertyMatch[1], 10);
    const propIndex = mockProperties.findIndex((p) => p.id === id);
    if (propIndex === -1) return { data: {}, status: 404 };

    if (method === 'get') return { data: mockProperties[propIndex], status: 200 };
    if (method === 'patch') {
      const body = JSON.parse(config.data || '{}');
      mockProperties[propIndex] = { ...mockProperties[propIndex], ...body };
      return { data: mockProperties[propIndex], status: 200 };
    }
    if (method === 'delete') {
      mockProperties.splice(propIndex, 1);
      return { data: {}, status: 204 };
    }
  }

  const propUnitsMatch = url.match(/^\/properties\/(\d+)\/units$/);
  if (propUnitsMatch && method === 'get') {
    const propId = parseInt(propUnitsMatch[1], 10);
    return { data: mockUnits.filter((u) => u.property_id === propId), status: 200 };
  }

  if (propUnitsMatch && method === 'post') {
    const propId = parseInt(propUnitsMatch[1], 10);
    const body = JSON.parse(config.data || '{}');
    const newUnit = {
      id: mockUnits.length + 101,
      property_id: propId,
      status: 'vacant',
      latitude: 28.6282,
      longitude: 77.3898,
      ...body,
    };
    mockUnits.push(newUnit);
    const capacity = body.capacity || 1;
    for (let i = 1; i <= capacity; i++) {
      mockBeds.push({ id: mockBeds.length + 1, unit_id: newUnit.id, bed_no: `Bed ${i}`, status: 'vacant' });
    }
    return { data: newUnit, status: 201 };
  }

  const unitMatch = url.match(/^\/units\/(\d+)$/);
  if (unitMatch) {
    const id = parseInt(unitMatch[1], 10);
    const unitIndex = mockUnits.findIndex((u) => u.id === id);
    if (unitIndex === -1) return { data: {}, status: 404 };

    if (method === 'get') return { data: mockUnits[unitIndex], status: 200 };
    if (method === 'patch') {
      const body = JSON.parse(config.data || '{}');
      mockUnits[unitIndex] = { ...mockUnits[unitIndex], ...body };
      return { data: mockUnits[unitIndex], status: 200 };
    }
    if (method === 'delete') {
      mockUnits.splice(unitIndex, 1);
      return { data: {}, status: 204 };
    }
  }

  // --- BEDS INVENTORY ---
  const bedsMatch = url.match(/^\/units\/(\d+)\/beds$/);
  if (bedsMatch && method === 'get') {
    const unitId = parseInt(bedsMatch[1], 10);
    return { data: mockBeds.filter((b) => b.unit_id === unitId), status: 200 };
  }

  // --- TENANTS & TENANCIES ---
  if (url === '/tenants' && method === 'get') {
    return { data: mockTenants, status: 200 };
  }

  if (url === '/tenants' && method === 'post') {
    const body = JSON.parse(config.data || '{}');
    const newTenant = { id: mockTenants.length + 1, user_id: mockTenants.length + 10, status: 'active', ...body };
    mockTenants.push(newTenant);
    return { data: newTenant, status: 201 };
  }

  if (url === '/tenants/me' && method === 'get') {
    const currentTenant = mockTenants.find((t) => t.user_id === mockUser?.id) || mockTenants[0];
    return { data: currentTenant, status: 200 };
  }

  const tenantMatch = url.match(/^\/tenants\/(\d+)$/);
  if (tenantMatch) {
    const id = parseInt(tenantMatch[1], 10);
    const tenant = mockTenants.find((t) => t.id === id);
    if (!tenant) return { data: {}, status: 404 };
    return { data: tenant, status: 200 };
  }

  // GET /tenancies?tenant_id=X or GET /tenancies (list)
  if (url.startsWith('/tenancies') && method === 'get') {
    const tenantIdParam = url.match(/tenant_id=(\d+)/);
    if (tenantIdParam) {
      const tenantId = parseInt(tenantIdParam[1], 10);
      const tenancy = mockTenancies.find((t) => t.tenant_id === tenantId && t.status === 'active');
      if (!tenancy) return { data: {}, status: 404 };
      return { data: tenancy, status: 200 };
    }
    return { data: mockTenancies, status: 200 };
  }

  if (url === '/tenancies' && method === 'post') {
    const body = JSON.parse(config.data || '{}');
    const newTenancy = { id: mockTenancies.length + 1, status: 'active', bed_ids: body.bed_ids || [], ...body };
    mockTenancies.push(newTenancy);

    const unit = mockUnits.find((u) => u.id === body.unit_id);
    if (unit) unit.status = 'occupied';

    if (body.bed_ids) {
      body.bed_ids.forEach((bid: number) => {
        const bed = mockBeds.find((b) => b.id === bid);
        if (bed) bed.status = 'occupied';
      });
    }

    const installmentCount = body.installment_count || 1;
    const monthlyRent = parseFloat(body.monthly_rent);
    const securityDeposit = parseFloat(body.security_deposit);
    const totalDues = monthlyRent + securityDeposit;

    if (installmentCount > 1) {
      const installAmount = Math.round(totalDues / installmentCount);
      for (let i = 0; i < installmentCount; i++) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + i * 30);
        mockInvoices.push({
          id: mockInvoices.length + 501,
          tenancy_id: newTenancy.id,
          billing_period: `Installment ${i + 1}/${installmentCount}`,
          due_date: dueDate.toISOString().split('T')[0],
          amount: installAmount,
          late_fee_amount: 0,
          status: 'pending',
        });
      }
    } else {
      mockInvoices.push({
        id: mockInvoices.length + 501,
        tenancy_id: newTenancy.id,
        billing_period: 'Booking Dues',
        due_date: body.start_date,
        amount: totalDues,
        late_fee_amount: 0,
        status: 'pending',
      });
    }

    mockLedger.push({
      id: mockLedger.length + 701,
      tenancy_id: newTenancy.id,
      payment_id: null,
      entry_type: 'security_deposit',
      direction: 'debit',
      amount: body.security_deposit,
      occurred_on: body.start_date,
      description: 'Security deposit due on check-in',
    });
    mockLedger.push({
      id: mockLedger.length + 701,
      tenancy_id: newTenancy.id,
      payment_id: null,
      entry_type: 'rent',
      direction: 'debit',
      amount: body.monthly_rent,
      occurred_on: body.start_date,
      description: 'First month rent due on check-in',
    });

    return { data: newTenancy, status: 201 };
  }

  const checkoutMatch = url.match(/^\/tenancies\/(\d+)\/checkout$/);
  if (checkoutMatch && method === 'post') {
    const tenancyId = parseInt(checkoutMatch[1], 10);
    const tenancyIndex = mockTenancies.findIndex((t) => t.id === tenancyId);
    if (tenancyIndex === -1) return { data: {}, status: 404 };

    mockTenancies[tenancyIndex].status = 'checked_out';
    const unit = mockUnits.find((u) => u.id === mockTenancies[tenancyIndex].unit_id);
    if (unit) unit.status = 'vacant';

    if (mockTenancies[tenancyIndex].bed_ids) {
      mockTenancies[tenancyIndex].bed_ids.forEach((bid: number) => {
        const bed = mockBeds.find((b) => b.id === bid);
        if (bed) bed.status = 'vacant';
      });
    }

    return {
      data: {
        tenancy: mockTenancies[tenancyIndex],
        outstanding_dues: 0,
        damage_deduction: 0,
        deposit_refund: mockTenancies[tenancyIndex].security_deposit,
      },
      status: 200,
    };
  }

  const getTenancyMatch = url.match(/^\/tenancies\/(\d+)$/);
  if (getTenancyMatch && method === 'get') {
    const id = parseInt(getTenancyMatch[1], 10);
    const tenancy = mockTenancies.find((t) => t.id === id);
    if (!tenancy) return { data: {}, status: 404 };
    return { data: tenancy, status: 200 };
  }

  if (url === '/tenancies/me' && method === 'get') {
    const currentTenant = mockTenants.find((t) => t.user_id === mockUser?.id) || mockTenants[0];
    const activeTenancy =
      mockTenancies.find((t) => t.tenant_id === currentTenant.id && t.status === 'active') || mockTenancies[0];
    const activeUnit = mockUnits.find((u) => u.id === activeTenancy.unit_id) || mockUnits[0];
    const activeProperty = mockProperties.find((p) => p.id === activeUnit.property_id) || mockProperties[0];

    return {
      data: {
        ...activeTenancy,
        tenant_name: currentTenant.name,
        unit: {
          id: activeUnit.id,
          unit_no: activeUnit.unit_no,
          building: activeUnit.building,
          floor: `${activeUnit.floor || 0} Floor`,
          rent: activeUnit.rent,
          deposit: activeUnit.deposit,
          status: activeUnit.status,
          property_name: activeProperty.name,
          property_address: `${activeProperty.address}, ${activeProperty.city || ''}, ${activeProperty.state || ''}`,
        },
      },
      status: 200,
    };
  }

  // --- FINANCE ---
  if (url === '/invoices' && method === 'get') {
    return { data: mockInvoices, status: 200 };
  }

  if (url === '/invoices' && method === 'post') {
    const body = JSON.parse(config.data || '{}');
    const newInvoice = { id: mockInvoices.length + 501, late_fee_amount: 0, status: 'pending', ...body };
    mockInvoices.push(newInvoice);
    return { data: newInvoice, status: 201 };
  }

  const getInvoiceMatch = url.match(/^\/invoices\/(\d+)$/);
  if (getInvoiceMatch && method === 'get') {
    const id = parseInt(getInvoiceMatch[1], 10);
    const inv = mockInvoices.find((i) => i.id === id);
    if (!inv) return { data: {}, status: 404 };
    return { data: inv, status: 200 };
  }

  // --- PAYMENTS & UTR ---
  if (url === '/payments/upi/submit' && method === 'post') {
    const { invoice_id, utr_number, amount } = JSON.parse(config.data || '{}');
    const invoice = mockInvoices.find((i) => i.id === invoice_id);
    if (invoice) invoice.status = 'submitted_pending_verification';

    const newPayment = {
      id: mockPayments.length + 601,
      invoice_id,
      tenancy_id: invoice ? invoice.tenancy_id : 1,
      amount: parseFloat(amount),
      payment_type: 'rent',
      mode: 'upi',
      status: 'submitted_pending_verification',
      paid_at: null,
      utr_number,
      submitted_at: new Date().toISOString(),
      verified_by_id: null,
      verified_at: null,
      rejection_reason: null,
    };
    mockPayments.push(newPayment);
    return { data: newPayment, status: 201 };
  }

  const verifyPaymentMatch = url.match(/^\/payments\/(\d+)\/verify$/);
  if (verifyPaymentMatch && method === 'patch') {
    const paymentId = parseInt(verifyPaymentMatch[1], 10);
    const { approve, rejection_reason } = JSON.parse(config.data || '{}');
    const payment = mockPayments.find((p) => p.id === paymentId);
    if (!payment) return { data: {}, status: 404 };

    if (approve) {
      payment.status = 'captured';
      payment.paid_at = new Date().toISOString();
      payment.verified_by_id = mockUser?.id || 1;
      payment.verified_at = payment.paid_at;
      payment.rejection_reason = null;
      const invoice = mockInvoices.find((i) => i.id === payment.invoice_id);
      if (invoice) invoice.status = 'paid';
      mockLedger.push({
        id: mockLedger.length + 701,
        tenancy_id: payment.tenancy_id || 1,
        payment_id: payment.id,
        entry_type: 'rent_payment',
        direction: 'credit',
        amount: payment.amount,
        occurred_on: new Date().toISOString().split('T')[0],
        description: `Rent payment via UPI (UTR: ${payment.utr_number})`,
      });
    } else {
      payment.status = 'rejected';
      payment.rejection_reason = rejection_reason || 'UTR verification failed';
      payment.verified_by_id = mockUser?.id || 1;
      payment.verified_at = new Date().toISOString();
      const invoice = mockInvoices.find((i) => i.id === payment.invoice_id);
      if (invoice) invoice.status = 'pending';
    }
    return { data: payment, status: 200 };
  }

  if (url.startsWith('/payments') && method === 'get') {
    const statusParam = url.match(/status=([^&]+)/);
    if (statusParam) {
      const statusValue = decodeURIComponent(statusParam[1]);
      return { data: mockPayments.filter((p) => p.status === statusValue), status: 200 };
    }
    return { data: mockPayments, status: 200 };
  }

  if (url.match(/^\/ledger/) && method === 'get') {
    return { data: mockLedger, status: 200 };
  }

  if (url.match(/^\/expenses/) && method === 'get') {
    return { data: mockExpenses, status: 200 };
  }

  if (url === '/expenses' && method === 'post') {
    const body = JSON.parse(config.data || '{}');
    const newExpense = { id: mockExpenses.length + 801, receipt_document_id: null, ...body };
    mockExpenses.push(newExpense);
    return { data: newExpense, status: 201 };
  }

  // --- NOTIFICATION ---
  if (url === '/notifications' && method === 'get') {
    return { data: mockNotifications, status: 200 };
  }

  const readNotifMatch = url.match(/^\/notifications\/(\d+)\/read$/);
  if (readNotifMatch && method === 'patch') {
    const id = parseInt(readNotifMatch[1], 10);
    const notif = mockNotifications.find((n) => n.id === id);
    if (notif) notif.status = 'read';
    return { data: notif, status: 200 };
  }

  if (url === '/notices' && method === 'post') {
    return { data: { recipients_notified: 8 }, status: 200 };
  }

  // --- MAINTENANCE ---
  if (url === '/maintenance-tickets' && method === 'get') {
    const mockTickets = [
      {
        id: 1,
        tenant_id: 1,
        unit_id: 101,
        category: 'Plumbing',
        priority: 'medium',
        status: 'open',
        description: 'Kitchen sink pipe dripping.',
        assigned_to_id: null,
        cost: null,
        resolved_at: null,
        created_at: '2026-07-08T12:00:00Z',
      },
      {
        id: 2,
        tenant_id: 1,
        unit_id: 101,
        category: 'Electrical',
        priority: 'high',
        status: 'in_progress',
        description: 'AC unit not blowing cold air.',
        assigned_to_id: 4,
        cost: 1200,
        resolved_at: null,
        created_at: '2026-07-07T10:00:00Z',
      },
    ];
    return { data: mockTickets, status: 200 };
  }

  if (url === '/maintenance-tickets' && method === 'post') {
    const body = JSON.parse(config.data || '{}');
    const newTicket = {
      id: 3,
      status: 'open',
      resolved_at: null,
      assigned_to_id: null,
      cost: null,
      created_at: new Date().toISOString(),
      ...body,
    };
    return { data: newTicket, status: 201 };
  }

  const ticketDetailMatch = url.match(/^\/maintenance-tickets\/(\d+)$/);
  if (ticketDetailMatch) {
    const id = parseInt(ticketDetailMatch[1], 10);
    const ticket = {
      id,
      tenant_id: 1,
      unit_id: 101,
      category: 'Plumbing',
      priority: 'medium',
      status: 'open',
      description: 'Kitchen sink pipe dripping.',
      assigned_to_id: null,
      cost: null,
      resolved_at: null,
      created_at: '2026-07-08T12:00:00Z',
    };
    if (method === 'get') return { data: ticket, status: 200 };
    if (method === 'patch') {
      const body = JSON.parse(config.data || '{}');
      return { data: { ...ticket, ...body }, status: 200 };
    }
  }

  // --- ANALYTICS ---
  if (url.match(/^\/analytics\/dashboard/) && method === 'get') {
    return {
      data: {
        property_id: null,
        occupancy_rate: 0.5,
        revenue_this_month: 33000,
        pending_dues_total: 18000,
        open_maintenance_tickets: 2,
        upcoming_move_ins: 1,
        upcoming_move_outs: 0,
      },
      status: 200,
    };
  }

  // --- CONSENTS ---
  if (url === '/consents/me' && method === 'get') {
    return { data: mockConsents.filter((c) => c.user_id === mockUser?.id), status: 200 };
  }

  if (url === '/consents' && method === 'post') {
    const { consent_type, granted, policy_version } = JSON.parse(config.data || '{}');
    const userId = mockUser?.id || 10;
    const existing = mockConsents.find((c) => c.user_id === userId && c.consent_type === consent_type);
    if (existing) {
      existing.granted = granted;
      existing.created_at = new Date().toISOString();
      return { data: existing, status: 200 };
    }
    const newConsent = {
      user_id: userId,
      consent_type,
      granted,
      policy_version: policy_version || '1.0',
      created_at: new Date().toISOString(),
    };
    mockConsents.push(newConsent);
    return { data: newConsent, status: 200 };
  }

  // --- DOCUMENTS ---
  const singleDocMatch = url.match(/^\/documents\/(\d+)$/);
  if (singleDocMatch) {
    const docId = parseInt(singleDocMatch[1], 10);
    const doc = mockDocs.find((d) => d.id === docId);
    if (!doc) return { data: {}, status: 404 };
    if (method === 'get') return { data: doc, status: 200 };
  }

  const docStatusMatch = url.match(/^\/documents\/(\d+)\/status$/);
  if (docStatusMatch && method === 'patch') {
    const docId = parseInt(docStatusMatch[1], 10);
    const { status, rejection_reason } = JSON.parse(config.data || '{}');
    const doc = mockDocs.find((d) => d.id === docId);
    if (!doc) return { data: {}, status: 404 };
    doc.status = status;
    doc.rejection_reason = rejection_reason || null;
    return { data: doc, status: 200 };
  }

  if (url === '/documents' && method === 'get') {
    return { data: mockDocs, status: 200 };
  }

  if (url === '/documents/presign-upload' && method === 'post') {
    return {
      data: { upload_url: 'https://s3.mock-presigned-url.com/upload', file_key: 'mock_key_s3' },
      status: 200,
    };
  }

  if (url === '/documents' && method === 'post') {
    const body = JSON.parse(config.data || '{}');
    const newDoc = { id: mockDocs.length + 951, status: 'pending', created_at: new Date().toISOString(), ...body };
    mockDocs.push(newDoc);
    return { data: newDoc, status: 201 };
  }

  const docDownloadMatch = url.match(/^\/documents\/(\d+)\/download$/);
  if (docDownloadMatch && method === 'get') {
    return {
      data: { download_url: 'https://s3.mock-presigned-url.com/download/lease.pdf' },
      status: 200,
    };
  }

  // --- AGREEMENT ENGINE ---

  // GET /agreements?tenant_id=X
  if (url.startsWith('/agreements') && method === 'get') {
    const tenantIdParam = url.match(/tenant_id=(\d+)/);
    if (tenantIdParam) {
      const tid = parseInt(tenantIdParam[1], 10);
      return { data: mockAgreements.filter((a) => a.tenant_id === tid), status: 200 };
    }
    const tenancyIdParam = url.match(/tenancy_id=(\d+)/);
    if (tenancyIdParam) {
      const tnid = parseInt(tenancyIdParam[1], 10);
      return { data: mockAgreements.filter((a) => a.tenancy_id === tnid), status: 200 };
    }
    // GET /agreements/{id}
    const agMatch = url.match(/^\/agreements\/(\d+)$/);
    if (agMatch) {
      const agId = parseInt(agMatch[1], 10);
      const ag = mockAgreements.find((a) => a.id === agId);
      if (!ag) return { data: {}, status: 404 };
      return { data: ag, status: 200 };
    }
    return { data: mockAgreements, status: 200 };
  }

  // POST /agreements — create a new agreement on check-in
  if (url === '/agreements' && method === 'post') {
    const body = JSON.parse(config.data || '{}');
    const newAg = {
      id: mockAgreements.length + 1,
      tracker_stage: 1,
      status: 'form_submitted',
      docx_file_name: null,
      docx_generated_at: null,
      form_data: {},
      created_at: new Date().toISOString(),
      ...body,
    };
    mockAgreements.push(newAg);
    return { data: newAg, status: 201 };
  }

  // PATCH /agreements/{id} — save form_data / update stage
  const agPatchMatch = url.match(/^\/agreements\/(\d+)$/);
  if (agPatchMatch && method === 'patch') {
    const agId = parseInt(agPatchMatch[1], 10);
    const ag = mockAgreements.find((a) => a.id === agId);
    if (!ag) return { data: {}, status: 404 };
    const body = JSON.parse(config.data || '{}');
    Object.assign(ag, body);
    return { data: ag, status: 200 };
  }

  // POST /agreements/{id}/compile-docx — triggers docx generation
  const compileMatch = url.match(/^\/agreements\/(\d+)\/compile-docx$/);
  if (compileMatch && method === 'post') {
    const agId = parseInt(compileMatch[1], 10);
    const ag = mockAgreements.find((a) => a.id === agId);
    if (!ag) return { data: {}, status: 404 };
    ag.tracker_stage = 2;
    ag.status = 'docx_generated';
    ag.docx_generated_at = new Date().toISOString();
    ag.docx_file_name = `agreement_tenant_${ag.tenant_id}_${new Date().toISOString().split('T')[0]}.docx`;
    return { data: ag, status: 200 };
  }

  // GET /agreements/{id}/uploads
  const agUploadsGet = url.match(/^\/agreements\/(\d+)\/uploads$/);
  if (agUploadsGet && method === 'get') {
    const agId = parseInt(agUploadsGet[1], 10);
    return { data: mockAgreementUploads.filter((u) => u.agreement_id === agId), status: 200 };
  }

  // POST /agreements/{id}/offline-upload
  const agUploadPost = url.match(/^\/agreements\/(\d+)\/offline-upload$/);
  if (agUploadPost && method === 'post') {
    const agId = parseInt(agUploadPost[1], 10);
    const body = JSON.parse(config.data || '{}');
    const ag = mockAgreements.find((a) => a.id === agId);
    if (ag && ag.tracker_stage < 3) {
      ag.tracker_stage = 3;
      ag.status = 'offline_pending';
    }
    const newUpload = {
      id: mockAgreementUploads.length + 1,
      agreement_id: agId,
      status: 'PENDING',
      uploaded_at: new Date().toISOString(),
      ...body,
    };
    mockAgreementUploads.push(newUpload);
    return { data: newUpload, status: 201 };
  }

  // PATCH /agreements/{id}/uploads/{uid} — update offline upload status
  const agUploadPatch = url.match(/^\/agreements\/(\d+)\/uploads\/(\d+)$/);
  if (agUploadPatch && method === 'patch') {
    const uid = parseInt(agUploadPatch[2], 10);
    const upload = mockAgreementUploads.find((u) => u.id === uid);
    if (!upload) return { data: {}, status: 404 };
    const body = JSON.parse(config.data || '{}');
    Object.assign(upload, body);
    // Promote to approved stage if all uploads are APPROVED
    const agId = upload.agreement_id;
    const ag = mockAgreements.find((a) => a.id === agId);
    const allUploads = mockAgreementUploads.filter((u) => u.agreement_id === agId);
    if (ag && allUploads.length > 0 && allUploads.every((u) => u.status === 'APPROVED')) {
      ag.tracker_stage = 4;
      ag.status = 'approved';
    }
    return { data: upload, status: 200 };
  }

  // --- STAFF MANAGEMENT ---
  if (url === '/staff' && method === 'get') {
    return { data: mockStaff, status: 200 };
  }

  if (url === '/staff' && method === 'post') {
    const body = JSON.parse(config.data || '{}');
    const newStaff = {
      id: mockStaff.length + 201,
      role: { id: 5, name: 'staff' },
      is_active: true,
      assigned_properties: [],
      created_at: new Date().toISOString(),
      ...body,
    };
    mockStaff.push(newStaff);
    return { data: newStaff, status: 201 };
  }

  const staffDetailMatch = url.match(/^\/staff\/(\d+)$/);
  if (staffDetailMatch) {
    const sid = parseInt(staffDetailMatch[1], 10);
    const member = mockStaff.find((s) => s.id === sid);
    if (!member) return { data: {}, status: 404 };
    if (method === 'get') return { data: member, status: 200 };
    if (method === 'patch') {
      const body = JSON.parse(config.data || '{}');
      Object.assign(member, body);
      return { data: member, status: 200 };
    }
    if (method === 'delete') {
      const idx = mockStaff.findIndex((s) => s.id === sid);
      if (idx !== -1) mockStaff.splice(idx, 1);
      return { data: { message: 'Staff member removed' }, status: 200 };
    }
  }

  return { data: {}, status: 404 };
};
