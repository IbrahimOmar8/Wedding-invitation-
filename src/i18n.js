const TRANSLATIONS = {
  en: {
    SAVE_DATE: 'SAVE THE DATE',
    WEDDING_OF: 'THE WEDDING OF',
    GETTING_MARRIED: 'We are getting married',
    FAMILIES_LABEL: 'An Invitation From Our Families',
    FAMILIES_TITLE: 'Together with their families',
    INVITE_TEXT: 'invite you to share in their joy as they begin their forever together',
    VIEW_LOCATION: 'VIEW LOCATION',
    INVITATION_DETAILS: 'Invitation Details',
    CANT_WAIT: 'We can’t wait to celebrate our love with all of you!',
    DATE: 'DATE',
    TIME: 'TIME',
    VENUE: 'VENUE',
    ADD_CALENDAR: 'ADD TO CALENDAR',
    GET_DIRECTIONS: 'GET DIRECTIONS',
    OUR_MEMORIES: 'Our Memories',
    MOMENTS: 'Moments Together',
    COUNTDOWN: 'Counting Down',
    UNTIL_IDO: 'Until We Say "I Do"',
    DAYS: 'DAYS', HOURS: 'HOURS', MINS: 'MINS', SECS: 'SECS',
    FINAL_NOTE: 'WE WAIT FOR YOU WITH LOVE',
    KINDLY_REPLY: 'Kindly Reply',
    WILL_YOU_JOIN: 'Will You Join Us?',
    YOUR_NAME: 'Your Name',
    EMAIL_OPT: 'Email (optional)',
    ATTEND_Q: 'Will you attend?',
    YES_JOY: 'Yes, with joy',
    NO_SORRY: 'Sorry, can\'t make it',
    NUM_GUESTS: 'Number of Guests',
    MESSAGE_OPT: 'Message (optional)',
    SEND_RSVP: 'SEND RSVP',
    RSVP_OK: 'Thank you! Your reply has been recorded.',
    OUR_STORY: 'Our Story',
    HOW_WE_MET: 'How We Met',
    EVENTS: 'Wedding Events',
    SCHEDULE: 'Schedule',
    WISHES: 'Wishes Wall',
    LEAVE_WISH: 'Leave a wish for the couple',
    YOUR_WISH: 'Your message',
    SEND_WISH: 'SEND WISH',
    WISH_OK: 'Thank you! Your wish has been added.',
    REGISTRY: 'Gift Registry',
    REGISTRY_NOTE: 'If you wish to give a gift',
    HELLO_GUEST: 'Dearest',
    PERSONAL_NOTE: 'This invitation is for you with love.',
  },
  ar: {
    SAVE_DATE: 'احفظ التاريخ',
    WEDDING_OF: 'حفل زفاف',
    GETTING_MARRIED: 'يتزوجان قريباً',
    FAMILIES_LABEL: 'دعوة من عائلتينا',
    FAMILIES_TITLE: 'بصحبة عائلتيهما',
    INVITE_TEXT: 'يتشرفان بدعوتكم لمشاركتهما فرحتهما في بداية حياتهما معاً',
    VIEW_LOCATION: 'عرض الموقع',
    INVITATION_DETAILS: 'تفاصيل الدعوة',
    CANT_WAIT: 'لا يسعنا الانتظار للاحتفال بحبنا معكم!',
    DATE: 'التاريخ',
    TIME: 'الوقت',
    VENUE: 'المكان',
    ADD_CALENDAR: 'إضافة للتقويم',
    GET_DIRECTIONS: 'الاتجاهات',
    OUR_MEMORIES: 'ذكرياتنا',
    MOMENTS: 'لحظات معاً',
    COUNTDOWN: 'العد التنازلي',
    UNTIL_IDO: 'حتى نقول "نعم"',
    DAYS: 'يوم', HOURS: 'ساعة', MINS: 'دقيقة', SECS: 'ثانية',
    FINAL_NOTE: 'بانتظاركم بكل حب',
    KINDLY_REPLY: 'يرجى الرد',
    WILL_YOU_JOIN: 'هل ستشاركوننا الفرحة؟',
    YOUR_NAME: 'الاسم',
    EMAIL_OPT: 'البريد الإلكتروني (اختياري)',
    ATTEND_Q: 'هل ستحضر؟',
    YES_JOY: 'نعم بكل سرور',
    NO_SORRY: 'آسف، لا أستطيع الحضور',
    NUM_GUESTS: 'عدد المرافقين',
    MESSAGE_OPT: 'رسالة (اختياري)',
    SEND_RSVP: 'إرسال الرد',
    RSVP_OK: 'شكراً لك! تم تسجيل ردك.',
    OUR_STORY: 'قصتنا',
    HOW_WE_MET: 'كيف التقينا',
    EVENTS: 'فعاليات الزفاف',
    SCHEDULE: 'الجدول',
    WISHES: 'حائط التمنيات',
    LEAVE_WISH: 'اترك تهنئة للعروسين',
    YOUR_WISH: 'رسالتك',
    SEND_WISH: 'إرسال التهنئة',
    WISH_OK: 'شكراً لك! تمت إضافة تهنئتك.',
    REGISTRY: 'قائمة الهدايا',
    REGISTRY_NOTE: 'إذا أردتم تقديم هدية',
    HELLO_GUEST: 'عزيزنا',
    PERSONAL_NOTE: 'هذه الدعوة لك مع كل الحب.',
  },
};

const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const WEEKDAYS_AR = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

function t(lang) {
  return TRANSLATIONS[lang] || TRANSLATIONS.en;
}

function months(lang) {
  if (lang === 'ar') return MONTHS_AR;
  return ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
}

function weekdays(lang) {
  if (lang === 'ar') return WEEKDAYS_AR;
  return ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
}

module.exports = { t, months, weekdays, TRANSLATIONS };
