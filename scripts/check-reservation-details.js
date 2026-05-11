#!/usr/bin/env node
'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESERVATION_ID = process.argv[2];

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Environment variables required:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!RESERVATION_ID) {
  console.error('❌ Usage: node scripts/check-reservation-details.js <reservation-id>');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getReservationDetails() {
  console.log(`🔍 Fetching reservation details for: ${RESERVATION_ID}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // 1. Get main reservation
    console.log('📋 1. Main Reservation Info:');
    const { data: reservation, error: resError } = await supabase
      .from('reservation')
      .select('*')
      .eq('re_id', RESERVATION_ID)
      .single();

    if (resError) {
      console.error(`   ❌ Error fetching reservation: ${resError.message}`);
      process.exit(1);
    }

    if (!reservation) {
      console.error(`   ❌ Reservation not found with ID: ${RESERVATION_ID}`);
      process.exit(1);
    }

    console.log(JSON.stringify(reservation, null, 2));

    // 2. Get user info
    if (reservation.re_user_id) {
      console.log('\n📋 2. User Info:');
      const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('id', reservation.re_user_id)
        .single();
      
      if (user) {
        console.log(JSON.stringify(user, null, 2));
      }
    }

    // 3. Get quote info
    if (reservation.re_quote_id) {
      console.log('\n📋 3. Quote Info:');
      const { data: quote } = await supabase
        .from('quote')
        .select('*')
        .eq('q_id', reservation.re_quote_id)
        .single();
      
      if (quote) {
        console.log(JSON.stringify(quote, null, 2));
      }
    }

    // 4. Get service-specific details based on type
    console.log(`\n📋 4. Service-Specific Details (Type: ${reservation.re_type}):`);
    
    const serviceTable = `reservation_${reservation.re_type}`;
    const { data: serviceData, error: serviceError } = await supabase
      .from(serviceTable)
      .select('*')
      .eq('reservation_id', RESERVATION_ID);

    if (!serviceError && serviceData && serviceData.length > 0) {
      console.log(`   ${serviceTable}:`);
      console.log(JSON.stringify(serviceData, null, 2));
    } else if (serviceError) {
      console.log(`   ⚠️  Table '${serviceTable}' query error: ${serviceError.message}`);
    }

    // 5. Check for change logs
    console.log('\n📋 5. Change History/Logs:');
    const { data: logs, error: logError } = await supabase
      .from('reservation_change_log')
      .select('*')
      .eq('reservation_id', RESERVATION_ID)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!logError && logs && logs.length > 0) {
      console.log('   Found change logs:');
      logs.forEach((log, idx) => {
        console.log(`\n   [${idx + 1}] ${log.created_at}`);
        console.log(`       Action: ${log.action}`);
        console.log(`       Changed by: ${log.changed_by}`);
        if (log.old_value) console.log(`       Old: ${log.old_value}`);
        if (log.new_value) console.log(`       New: ${log.new_value}`);
        if (log.notes) console.log(`       Notes: ${log.notes}`);
      });
    } else if (logError) {
      console.log(`   ℹ️  No change log table or error: ${logError.message}`);
    } else {
      console.log('   No change logs found');
    }

    // 6. Check for comments/notes
    console.log('\n📋 6. Reservation Comments:');
    const { data: comments, error: commentError } = await supabase
      .from('reservation_comments')
      .select('*')
      .eq('reservation_id', RESERVATION_ID)
      .order('created_at', { ascending: false })
      .limit(10);

    if (!commentError && comments && comments.length > 0) {
      console.log('   Found comments:');
      comments.forEach((comment, idx) => {
        console.log(`\n   [${idx + 1}] ${comment.created_at}`);
        console.log(`       By: ${comment.author}`);
        console.log(`       Content: ${comment.content}`);
      });
    } else if (commentError) {
      console.log(`   ℹ️  No comments table or error: ${commentError.message}`);
    } else {
      console.log('   No comments found');
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

getReservationDetails();
