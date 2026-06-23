import { Comment, TeamMember, Campaign, Ad, AutoTaggingRule, CommentPriority } from './types';

export const teamMembers: TeamMember[] = [
  {
    id: 'team-1',
    name: 'Sarah Jenkins',
    email: 'sarah.j@growthdigital.com',
    role: 'SaaS Campaign Lead',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=120'
  },
  {
    id: 'team-2',
    name: 'Ali Mansoor',
    email: 'ali.m@growthdigital.com',
    role: 'Customer Engagement Coordinator',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=120'
  },
  {
    id: 'team-3',
    name: 'Emily Chen',
    email: 'emily.c@growthdigital.com',
    role: 'Social Media Manager',
    avatarUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=120'
  },
  {
    id: 'team-4',
    name: 'Marcus Brody',
    email: 'marcus.b@growthdigital.com',
    role: 'Growth Specialist',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=120'
  }
];

export const mockCampaigns: Campaign[] = [
  {
    id: 'camp-1',
    platform: 'facebook',
    campaignId: '12020938459281',
    campaignName: 'Summer Clearance Blowout 2026',
    status: 'Active',
    budget: '$5,000/day',
    commentsCount: 24
  },
  {
    id: 'camp-2',
    platform: 'instagram',
    campaignId: '12020938112391',
    campaignName: 'New Product Launch - TechSleeve Pro',
    status: 'Active',
    budget: '$7,500/day',
    commentsCount: 18
  },
  {
    id: 'camp-3',
    platform: 'facebook',
    campaignId: '12020938451102',
    campaignName: 'Lead Gen - Marketing ROI Masterclass',
    status: 'Active',
    budget: '$2,500/day',
    commentsCount: 12
  },
  {
    id: 'camp-4',
    platform: 'instagram',
    campaignId: '12020938222910',
    campaignName: 'Brand Awareness - Eco Friendly Bottles',
    status: 'Paused',
    budget: '$1,500/day',
    commentsCount: 9
  }
];

export const mockAds: Ad[] = [
  {
    id: 'ad-1',
    platform: 'facebook',
    adId: 'ad_928131',
    adName: 'Video - Summer Clearance 50% Off',
    adsetName: 'Broad Audience US 25-54',
    campaignName: 'Summer Clearance Blowout 2026',
    originalAdUrl: 'https://facebook.com/ads/library/?id=928131',
    mediaType: 'video',
    mediaUrl: 'https://assets.mixkit.co/videos/preview/mixkit-shoppings-bags-and-hands-of-a-woman-close-up-15340-large.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=800',
    adCopy: 'The Ultimate Summer Clearance starts now! Get 50% off all sustainable apparel, organic accessories, and green living essentials. Discount applied automatically at checkout. Free shipping on all orders over $75. Tap shop now while stocks last.',
    headline: '50% OFF AUTOMATIC APPLIED — WAREHOUSE SALE',
    description: 'Limited-time warehouse clearance on eco-friendly apparel and accessories.',
    cta: 'Shop Now',
    likesCount: 1240,
    sharesCount: 382,
    commentsCount: 89,
  },
  {
    id: 'ad-2',
    platform: 'instagram',
    adId: 'ad_112391',
    adName: 'Dynamic Carousel - TechSleeve Showcase',
    adsetName: 'Tech Enthusiasts Lookalike 2%',
    campaignName: 'New Product Launch - TechSleeve Pro',
    originalAdUrl: 'https://instagram.com/p/C_mSF82a1A/',
    mediaType: 'video',
    mediaUrl: 'https://assets.mixkit.co/videos/preview/mixkit-holding-a-smartphone-next-to-a-laptop-42173-large.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&q=80&w=800',
    adCopy: 'Designed for modern creators. TechSleeve Pro is handcrafted with water-resistant recycled wool, padded memory armor, and premium vegan leather. Sleek design, planet-safe materials, lifetime guarantee. Grab yours now with next-day shipping.',
    headline: 'MEET TECHSLEEVE PRO: RECYCLED HYBRID ARMOR',
    description: 'Premium laptop sleeve with recycled materials and lifetime guarantee.',
    cta: 'Learn More',
    likesCount: 894,
    sharesCount: 154,
    commentsCount: 47,
  },
  {
    id: 'ad-3',
    platform: 'facebook',
    adId: 'ad_451102',
    adName: 'Lead Form - Masterclass Free Download',
    adsetName: 'B2B Founders & Marketing Directors',
    campaignName: 'Lead Gen - Marketing ROI Masterclass',
    originalAdUrl: 'https://facebook.com/ads/library/?id=451102',
    mediaType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1200',
    thumbnailUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=400',
    adCopy: 'Stop burning cash on underperforming social ad campaigns. Download our complete 2026 Meta Ads ROI Masterclass blueprint + funnel assets for free. Learn the scale playbook used by team managers to hit $10M ARR.',
    headline: 'Meta Ads Secrets: The $10M Comment Automation Funnel',
    description: 'Free masterclass for marketing directors and growth teams.',
    cta: 'Download Free',
    likesCount: 2315,
    sharesCount: 1042,
    commentsCount: 156,
  },
  {
    id: 'ad-4',
    platform: 'instagram',
    adId: 'ad_222910',
    adName: 'Eco Bottle Aesthetic Lifestyle Video',
    adsetName: 'Sustainability Interest US',
    campaignName: 'Brand Awareness - Eco Friendly Bottles',
    originalAdUrl: 'https://instagram.com/p/D_mNF11c9B/',
    mediaType: 'video',
    mediaUrl: 'https://assets.mixkit.co/videos/preview/mixkit-woman-holding-a-reusable-water-bottle-43187-large.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&q=80&w=800',
    adCopy: 'Meet the bottle that changes everything. Dual-sealed vacuum insulation keeps pure spring water ice-cold for 24 hours. Hand-finished premium chemical-free organic bamboo exterior shell. Click shop now to claim your first-order welcome gift!',
    headline: 'Pure Bio-Core Bamboo — Keeps Cold for 24 hours',
    description: 'Sustainable water bottle with 24-hour cold retention.',
    cta: 'Shop Now',
    likesCount: 712,
    sharesCount: 99,
    commentsCount: 34,
  },
];

export const mockAdAccounts = [
  { id: 'act_92847102', name: 'GrowthDigital — Main Ad Account', platform: 'facebook' as const, spend: '$42,500/mo', status: 'Active' },
  { id: 'act_11293847', name: 'GrowthDigital — Instagram Boost', platform: 'instagram' as const, spend: '$18,200/mo', status: 'Active' },
  { id: 'act_44829103', name: 'GrowthDigital — Lead Gen', platform: 'facebook' as const, spend: '$8,750/mo', status: 'Active' },
];

export const getAdsForCampaign = (campaignName: string): Ad[] =>
  mockAds.filter(ad => ad.campaignName === campaignName);

export const getAdsetsForCampaign = (campaignName: string): string[] =>
  [...new Set(mockAds.filter(ad => ad.campaignName === campaignName).map(ad => ad.adsetName))];

export const initialComments: Comment[] = [
  {
    id: 'comment-1',
    platform: 'facebook',
    commentId: 'c_84920193859',
    commentText: 'Is the 50% discount automatically applied at checkout, or do we need a discount code? I tried placing an order but the price did not change.',
    commenterName: 'David Miller',
    commenterProfileUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=120',
    originalCommentUrl: 'https://facebook.com/ads/comments/84920193859',
    campaignId: 'camp-1',
    campaignName: 'Summer Clearance Blowout 2026',
    adsetId: 'adset_9921',
    adsetName: 'Broad Audience US 25-54',
    adId: 'ad-1',
    adName: 'Video - Summer Clearance 50% Off',
    pageId: 'page_growthdigital',
    pageName: 'GrowthDigital Eco Store',
    status: 'Unseen',
    priority: 'High',
    sentiment: 'Question',
    tags: ['Promo Code', 'Checkout Issue'],
    createdAt: '2026-06-22T12:05:00-07:00',
    updatedAt: '2026-06-22T12:05:00-07:00'
  },
  {
    id: 'comment-2',
    platform: 'instagram',
    commentId: 'c_17283940192',
    commentText: 'This looks super neat! Does it fit the new 16-inch MacBook M3 Pro? And what is the material inside?',
    commenterName: 'Sophia Loren',
    commenterProfileUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=120',
    originalCommentUrl: 'https://instagram.com/p/C_mSF82a1A/#c_17283940192',
    campaignId: 'camp-2',
    campaignName: 'New Product Launch - TechSleeve Pro',
    adsetId: 'adset_7721',
    adsetName: 'Tech Enthusiasts Lookalike 2%',
    adId: 'ad-2',
    adName: 'Dynamic Carousel - TechSleeve Showcase',
    instagramAccountId: 'ig_growth_eco',
    instagramAccountName: '@growth_eco_tech',
    status: 'Seen',
    priority: 'Medium',
    sentiment: 'Question',
    assignedTo: 'team-1',
    tags: ['Size Inquiry', 'Sleeve Material'],
    createdAt: '2026-06-22T11:42:00-07:00',
    updatedAt: '2026-06-22T11:48:00-07:00',
    seenAt: '2026-06-22T11:48:00-07:00'
  },
  {
    id: 'comment-3',
    platform: 'facebook',
    commentId: 'c_91029318239',
    commentText: 'I ordered this bottle 3 weeks ago and STILL have not received a tracking number! This is a total scam. Do not buy!',
    commenterName: 'Robert Vance',
    commenterProfileUrl: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&q=80&w=120',
    originalCommentUrl: 'https://facebook.com/ads/comments/91029318239',
    campaignId: 'camp-1',
    campaignName: 'Summer Clearance Blowout 2026',
    adsetId: 'adset_9921',
    adsetName: 'Broad Audience US 25-54',
    adId: 'ad-1',
    adName: 'Video - Summer Clearance 50% Off',
    pageId: 'page_growthdigital',
    pageName: 'GrowthDigital Eco Store',
    status: 'Unseen',
    priority: 'Urgent',
    sentiment: 'Complaint',
    tags: ['Shipping Delay', 'Angry Customer'],
    createdAt: '2026-06-22T10:15:00-07:00',
    updatedAt: '2026-06-22T10:15:00-07:00'
  },
  {
    id: 'comment-4',
    platform: 'instagram',
    commentId: 'c_4483719230',
    commentText: 'Absolutely love the color of this eco bottle. Got mine yesterday, it keeps my water cold all day long during hikes! Highly recommend! 😍',
    commenterName: 'Jessica Thorne',
    commenterProfileUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=120',
    originalCommentUrl: 'https://instagram.com/p/D_mNF11c9B/#c_4483719230',
    campaignId: 'camp-4',
    campaignName: 'Brand Awareness - Eco Friendly Bottles',
    adsetId: 'adset_1102',
    adsetName: 'Sustainability Interest US',
    adId: 'ad-4',
    adName: 'Eco Bottle Aesthetic Lifestyle Video',
    instagramAccountId: 'ig_growth_eco',
    instagramAccountName: '@growth_eco_tech',
    status: 'Replied',
    priority: 'Low',
    sentiment: 'Positive',
    assignedTo: 'team-3',
    tags: ['Testimonial', 'Appreciation'],
    createdAt: '2026-06-22T09:30:00-07:00',
    updatedAt: '2026-06-22T10:05:00-07:00',
    seenAt: '2026-06-22T09:40:00-07:00',
    repliedAt: '2026-06-22T10:05:00-07:00'
  },
  {
    id: 'comment-5',
    platform: 'facebook',
    commentId: 'c_3840294191',
    commentText: 'How is the masterclass structured? Are there live sessions or is it completely self-paced? Please let me know so I can sign up.',
    commenterName: 'Dr. Evelyn Foster',
    commenterProfileUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=120',
    originalCommentUrl: 'https://facebook.com/ads/comments/3840294191',
    campaignId: 'camp-3',
    campaignName: 'Lead Gen - Marketing ROI Masterclass',
    adsetId: 'adset_8811',
    adsetName: 'B2B Founders & Marketing Directors',
    adId: 'ad-3',
    adName: 'Lead Form - Masterclass Free Download',
    pageId: 'page_growthdigital',
    pageName: 'GrowthDigital Eco Store',
    status: 'Seen',
    priority: 'Medium',
    sentiment: 'Question',
    assignedTo: 'team-2',
    tags: ['Masterclass Inquiry', 'Format Inquiry'],
    createdAt: '2026-06-22T08:15:00-07:00',
    updatedAt: '2026-06-22T08:30:00-07:00',
    seenAt: '2026-06-22T08:30:00-07:00'
  },
  {
    id: 'comment-6',
    platform: 'instagram',
    commentId: 'c_7749210492',
    commentText: 'Shipping costs $15 to Canada? That is literally half the price of the sleeve itself. Complete turn-off.',
    commenterName: 'Alex Tremblay',
    commenterProfileUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=120',
    originalCommentUrl: 'https://instagram.com/p/C_mSF82a1A/#c_7749210492',
    campaignId: 'camp-2',
    campaignName: 'New Product Launch - TechSleeve Pro',
    adsetId: 'adset_7721',
    adsetName: 'Tech Enthusiasts Lookalike 2%',
    adId: 'ad-2',
    adName: 'Dynamic Carousel - TechSleeve Showcase',
    instagramAccountId: 'ig_growth_eco',
    instagramAccountName: '@growth_eco_tech',
    status: 'Unseen',
    priority: 'Medium',
    sentiment: 'Complaint',
    tags: ['Shipping Rates', 'Cost Issue'],
    createdAt: '2026-06-22T07:22:00-07:00',
    updatedAt: '2026-06-22T07:22:00-07:00'
  },
  {
    id: 'comment-7',
    platform: 'facebook',
    commentId: 'c_5549102928',
    commentText: 'Get rich quick schemes... another useless digital marketing masterclass. Just look up YouTube videos for free.',
    commenterName: 'Gary Jenkins',
    commenterProfileUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=120',
    originalCommentUrl: 'https://facebook.com/ads/comments/5549102928',
    campaignId: 'camp-3',
    campaignName: 'Lead Gen - Marketing ROI Masterclass',
    adsetId: 'adset_8811',
    adsetName: 'B2B Founders & Marketing Directors',
    adId: 'ad-3',
    adName: 'Lead Form - Masterclass Free Download',
    pageId: 'page_growthdigital',
    pageName: 'GrowthDigital Eco Store',
    status: 'Ignored',
    priority: 'Low',
    sentiment: 'Negative',
    assignedTo: 'team-2',
    tags: ['Critique', 'Skepticism'],
    createdAt: '2026-06-22T05:10:00-07:00',
    updatedAt: '2026-06-22T09:12:00-07:00',
    seenAt: '2026-06-22T09:10:00-07:00'
  },
  {
    id: 'comment-8',
    platform: 'instagram',
    commentId: 'c_8830192831',
    commentText: 'Do you ship to Germany? Please say yes, I desperately need this sleek modern design sleeve! 🇩🇪',
    commenterName: 'Hannah Weber',
    commenterProfileUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&q=80&w=120',
    originalCommentUrl: 'https://instagram.com/p/C_mSF82a1A/#c_8830192831',
    campaignId: 'camp-2',
    campaignName: 'New Product Launch - TechSleeve Pro',
    adsetId: 'adset_7721',
    adsetName: 'Tech Enthusiasts Lookalike 2%',
    adId: 'ad-2',
    adName: 'Dynamic Carousel - TechSleeve Showcase',
    instagramAccountId: 'ig_growth_eco',
    instagramAccountName: '@growth_eco_tech',
    status: 'Replied',
    priority: 'High',
    sentiment: 'Question',
    assignedTo: 'team-3',
    tags: ['International Shipping', 'German Market'],
    createdAt: '2026-06-21T21:40:00-07:00',
    updatedAt: '2026-06-22T09:15:00-07:00',
    seenAt: '2026-06-22T08:35:00-07:00',
    repliedAt: '2026-06-22T09:15:00-07:00'
  },
  {
    id: 'comment-9',
    platform: 'facebook',
    commentId: 'c_9930419284',
    commentText: 'Which colors are still in stock for the clearance event? I see only three listed on the landing page, but the video ad shows five.',
    commenterName: 'Brian Griffin',
    commenterProfileUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&q=80&w=120',
    originalCommentUrl: 'https://facebook.com/ads/comments/9930419284',
    campaignId: 'camp-1',
    campaignName: 'Summer Clearance Blowout 2026',
    adsetId: 'adset_9921',
    adsetName: 'Broad Audience US 25-54',
    adId: 'ad-1',
    adName: 'Video - Summer Clearance 50% Off',
    pageId: 'page_growthdigital',
    pageName: 'GrowthDigital Eco Store',
    status: 'Unseen',
    priority: 'Low',
    sentiment: 'Question',
    tags: ['Stock Inquiry', 'Color Options'],
    createdAt: '2026-06-22T13:10:00-07:00',
    updatedAt: '2026-06-22T13:10:00-07:00'
  },
  {
    id: 'comment-10',
    platform: 'instagram',
    commentId: 'c_3394019281',
    commentText: 'Worst customer experience ever. Delayed responses, incorrect order, and zero help from their support bot. DO NOT RECOMMEND.',
    commenterName: 'Liam O Connor',
    commenterProfileUrl: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&q=80&w=120',
    originalCommentUrl: 'https://instagram.com/p/D_mNF11c9B/#c_3394019281',
    campaignId: 'camp-4',
    campaignName: 'Brand Awareness - Eco Friendly Bottles',
    adsetId: 'adset_1102',
    adsetName: 'Sustainability Interest US',
    adId: 'ad-4',
    adName: 'Eco Bottle Aesthetic Lifestyle Video',
    instagramAccountId: 'ig_growth_eco',
    instagramAccountName: '@growth_eco_tech',
    status: 'Unseen',
    priority: 'Urgent',
    sentiment: 'Complaint',
    tags: ['Bad Support', 'Refund Request'],
    createdAt: '2026-06-22T13:20:00-07:00',
    updatedAt: '2026-06-22T13:20:00-07:00'
  }
];

export const preMadeNotes = [
  {
    id: 'note-1',
    commentId: 'comment-3',
    userId: 'team-1',
    userName: 'Sarah Jenkins',
    userAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=120',
    note: 'Rob has filed a complaint. Checking the ShipHero ERP logs... It seems his package has been stuck at the Chicago regional facility. I am looking up the carrier claim code.',
    createdAt: '2026-06-22T11:00:00-07:00'
  },
  {
    id: 'note-2',
    commentId: 'comment-2',
    userId: 'team-1',
    userName: 'Sarah Jenkins',
    userAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=120',
    note: 'Sleeve interior is faux microfiber velvet. Double checking with logistics if the laptop fits snugly.',
    createdAt: '2026-06-22T11:45:00-07:00'
  }
];

export const initialActivityLogs = [
  {
    id: 'log-1',
    commentId: 'comment-2',
    userId: 'team-1',
    userName: 'Sarah Jenkins',
    action: 'Status Change',
    oldValue: 'Unseen',
    newValue: 'Seen',
    createdAt: '2026-06-22T11:48:00-07:00'
  },
  {
    id: 'log-2',
    commentId: 'comment-2',
    userId: 'team-1',
    userName: 'Sarah Jenkins',
    action: 'Assignment',
    oldValue: 'Unassigned',
    newValue: 'Sarah Jenkins',
    createdAt: '2026-06-22T11:48:00-07:00'
  },
  {
    id: 'log-3',
    commentId: 'comment-4',
    userId: 'team-3',
    userName: 'Emily Chen',
    action: 'Status Change',
    oldValue: 'Unseen',
    newValue: 'Seen',
    createdAt: '2026-06-22T09:40:00-07:00'
  },
  {
    id: 'log-4',
    commentId: 'comment-4',
    userId: 'team-3',
    userName: 'Emily Chen',
    action: 'Status Change',
    oldValue: 'Seen',
    newValue: 'Replied',
    createdAt: '2026-06-22T10:05:00-07:00'
  }
];

export const mockAutoTaggingRules: AutoTaggingRule[] = [
  {
    id: 'rule-1',
    keyword: 'code',
    tag: 'Promo Code',
    priority: 'High',
    isActive: true
  },
  {
    id: 'rule-2',
    keyword: 'discount',
    tag: 'Promo Code',
    priority: 'High',
    isActive: true
  },
  {
    id: 'rule-3',
    keyword: 'ship',
    tag: 'Shipping Delay',
    priority: 'High',
    isActive: true
  },
  {
    id: 'rule-4',
    keyword: 'scam',
    tag: 'Angry Customer',
    priority: 'Urgent',
    isActive: true
  },
  {
    id: 'rule-5',
    keyword: 'price',
    tag: 'Pricing Inquiry',
    priority: 'Medium',
    isActive: true
  },
  {
    id: 'rule-6',
    keyword: 'cost',
    tag: 'Pricing Inquiry',
    priority: 'Medium',
    isActive: true
  }
];

export const connectedPages = [
  { id: 'page-1', platform: 'facebook', name: 'GrowthDigital Eco Store', fans: '42,910 Followers', isConnected: true, avatar: '🛍️' },
  { id: 'page-2', platform: 'facebook', name: 'GrowthDigital Hub', fans: '12,400 Followers', isConnected: false, avatar: '💼' },
  { id: 'ig-1', platform: 'instagram', name: '@growth_eco_tech', fans: '84,200 Followers', isConnected: true, avatar: '📸' },
  { id: 'ig-2', platform: 'instagram', name: '@growthdigital_agency', fans: '3,110 Followers', isConnected: false, avatar: '🚀' }
];

export const autoTag = (text: string): { tags: string[], priority?: CommentPriority } => {
  const lowercase = text.toLowerCase();
  const matchedTags: string[] = [];
  let highestPriority: CommentPriority | undefined = undefined;

  for (const rule of mockAutoTaggingRules) {
    if (rule.isActive && lowercase.includes(rule.keyword)) {
      if (!matchedTags.includes(rule.tag)) {
        matchedTags.push(rule.tag);
      }
      if (rule.priority === 'Urgent') {
        highestPriority = 'Urgent';
      } else if (rule.priority === 'High' && highestPriority !== 'Urgent') {
        highestPriority = 'High';
      } else if (rule.priority === 'Medium' && !highestPriority) {
        highestPriority = 'Medium';
      }
    }
  }

  return { tags: matchedTags, priority: highestPriority };
};
