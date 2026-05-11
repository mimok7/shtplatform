#!/usr/bin/env node
'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Environment variables required:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkPriceBreakdown() {
  console.log('🔍 Analyzing reservation.price_breakdown column');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Get total count
    const { count: totalCount } = await supabase
      .from('reservation')
      .select('*', { count: 'exact', head: true });

    console.log(`📊 Total reservations: ${totalCount}\n`);

    // Check price_breakdown distribution
    console.log('📋 price_breakdown Status:');
    
    // Get all records to check
    const { data: allRecords, error: fetchErr } = await supabase
      .from('reservation')
      .select('re_id, re_type, price_breakdown, re_status, re_created_at')
      .limit(500);

    if (fetchErr) {
      throw new Error(`Failed to fetch reservations: ${fetchErr.message}`);
    }

    let withData = 0;
    let withoutData = 0;
    let nullData = 0;
    let emptyObject = 0;
    let validStructure = 0;
    const samplesWithData = [];
    const samplesEmpty = [];

    allRecords.forEach(record => {
      if (!record.price_breakdown) {
        nullData++;
        samplesEmpty.push(record.re_id);
      } else if (typeof record.price_breakdown === 'object' && Object.keys(record.price_breakdown).length === 0) {
        emptyObject++;
        samplesEmpty.push(record.re_id);
      } else if (typeof record.price_breakdown === 'object') {
        withData++;
        validStructure++;
        if (samplesWithData.length < 3) {
          samplesWithData.push({
            id: record.re_id,
            type: record.re_type,
            keys: Object.keys(record.price_breakdown).sort(),
            hasTotal: !!record.price_breakdown.grand_total || !!record.price_breakdown.calculated_total
          });
        }
      }
    });

    console.log(`   ✓ With data: ${withData}`);
    console.log(`   ✗ NULL: ${nullData}`);
    console.log(`   ✗ Empty object: ${emptyObject}`);
    console.log(`   ✓ Valid structure: ${validStructure}\n`);

    const filledPercentage = totalCount ? ((withData / totalCount) * 100).toFixed(1) : 0;
    console.log(`   ⚡ Filled rate: ${filledPercentage}%\n`);

    // Show samples with data
    if (samplesWithData.length > 0) {
      console.log('📦 Sample records WITH price_breakdown:');
      samplesWithData.forEach((sample, idx) => {
        console.log(`\n   [${idx + 1}] ID: ${sample.id}`);
        console.log(`       Type: ${sample.type}`);
        console.log(`       Keys: ${sample.keys.join(', ')}`);
        console.log(`       Has total: ${sample.hasTotal ? '✓' : '✗'}`);
      });
    }

    // Show samples without data
    if (samplesEmpty.length > 0) {
      console.log(`\n📭 Sample records WITHOUT price_breakdown:`);
      const samples = samplesEmpty.slice(0, 3);
      samples.forEach((id, idx) => {
        console.log(`   [${idx + 1}] ${id}`);
      });
      if (samplesEmpty.length > 3) {
        console.log(`   ... and ${samplesEmpty.length - 3} more`);
      }
    }

    // Detailed check for specific reservation
    console.log('\n\n📋 Specific Check for: 65078917-1871-48dd-85b4-9ab72e5088cb');
    const { data: specific } = await supabase
      .from('reservation')
      .select('re_id, price_breakdown')
      .eq('re_id', '65078917-1871-48dd-85b4-9ab72e5088cb')
      .single();

    if (specific && specific.price_breakdown) {
      console.log('   ✓ price_breakdown exists');
      console.log(`   Size: ${JSON.stringify(specific.price_breakdown).length} bytes`);
      console.log(`   Top-level keys: ${Object.keys(specific.price_breakdown).join(', ')}`);
      
      if (specific.price_breakdown.rooms && Array.isArray(specific.price_breakdown.rooms)) {
        console.log(`   Room details: ${specific.price_breakdown.rooms.length} room(s)`);
        specific.price_breakdown.rooms.forEach((room, idx) => {
          console.log(`     [Room ${idx + 1}] ${room.room_type || 'N/A'} - ₩${room.total || 0}`);
        });
      }
    } else {
      console.log('   ✗ price_breakdown is empty or null');
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkPriceBreakdown();
