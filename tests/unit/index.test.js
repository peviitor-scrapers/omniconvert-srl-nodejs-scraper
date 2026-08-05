import { jest } from '@jest/globals';
import * as cheerio from 'cheerio';

describe('index.js Component Tests', () => {
  let index;

  beforeAll(async () => {
    index = await import('../../scraper/index.js');
  });

  describe('parseAboutPageJobs', () => {
    it('should parse job links from the Omniconvert about page', () => {
      const html = `
        <ul>
          <li><h4>Senior Developer</h4><a href="/jobs/senior-developer">View</a></li>
          <li><h4>Product Manager</h4><a href="/jobs/product-manager">View</a></li>
        </ul>
      `;

      const jobs = index.parseAboutPageJobs(html);

      expect(jobs).toHaveLength(2);
      expect(jobs[0]).toEqual(expect.objectContaining({
        title: 'Senior Developer',
        url: 'https://www.omniconvert.com/jobs/senior-developer',
        location: '',
        workplaceType: ''
      }));
      expect(jobs[1].title).toBe('Product Manager');
    });

    it('should ignore links that are not job pages', () => {
      const html = `
        <ul>
          <li><h4>Team</h4><a href="/about/">About</a></li>
          <li><h4>Senior Developer</h4><a href="/jobs/senior-developer">View</a></li>
        </ul>
      `;

      const jobs = index.parseAboutPageJobs(html);

      expect(jobs).toHaveLength(1);
      expect(jobs[0].url).toBe('https://www.omniconvert.com/jobs/senior-developer');
    });

    it('should deduplicate jobs with the same URL', () => {
      const html = `
        <ul>
          <li><h4>Senior Developer</h4><a href="/jobs/senior-developer">A</a></li>
          <li><h4>Senior Developer</h4><a href="/jobs/senior-developer">B</a></li>
        </ul>
      `;

      const jobs = index.parseAboutPageJobs(html);

      expect(jobs).toHaveLength(1);
    });

    it('should handle empty HTML', () => {
      const jobs = index.parseAboutPageJobs('');
      expect(jobs).toEqual([]);
    });
  });

  describe('extractStructuredData', () => {
    it('should extract JobPosting data from ld+json', () => {
      const html = `
        <script type="application/ld+json">
        {
          "@graph": [
            {
              "@type": "JobPosting",
              "title": "Growth Engineer",
              "datePosted": "2026-07-01T10:00:00Z",
              "employmentType": "FULL_TIME",
              "jobLocation": { "address": { "addressLocality": "Bucharest" } }
            }
          ]
        }
        </script>
      `;

      const data = index.extractStructuredData(html);

      expect(data.title).toBe('Growth Engineer');
      expect(data.location).toBe('București');
      expect(data.workplaceType).toBe('hybrid');
      expect(data.postingDate).toBe('2026-07-01');
    });

    it('should return empty fields when no JobPosting found', () => {
      const data = index.extractStructuredData('<html><body>No jobs</body></html>');
      expect(data).toEqual({ title: '', location: '', workplaceType: '', postingDate: '' });
    });
  });

  describe('extractLocationFromText', () => {
    it('should extract combined location and work type', () => {
      const data = index.extractLocationFromText('Bucharest · Remote');
      expect(data.location).toBe('București');
      expect(data.workplaceType).toBe('remote');
    });

    it('should extract location only', () => {
      const data = index.extractLocationFromText('Working in Cluj');
      expect(data.location).toBe('Cluj');
      expect(data.workplaceType).toBe('');
    });

    it('should extract work type only', () => {
      const data = index.extractLocationFromText('Fully Remote role');
      expect(data.location).toBe('');
      expect(data.workplaceType).toBe('remote');
    });
  });

  describe('transformJobsForSOLR', () => {
    it('should keep location when it is a Romanian city', () => {
      const payload = {
        jobs: [
          { url: 'https://www.omniconvert.com/jobs/1', title: 'Job 1', location: ['București'] },
          { url: 'https://www.omniconvert.com/jobs/2', title: 'Job 2', location: ['Bucharest'] },
          { url: 'https://www.omniconvert.com/jobs/3', title: 'Job 3', location: ['Sofia'] },
          { url: 'https://www.omniconvert.com/jobs/4', title: 'Job 4', location: [] }
        ]
      };

      const result = index.transformJobsForSOLR(payload);

      expect(result.jobs[0].location).toEqual(['București']);
      expect(result.jobs[1].location).toEqual(['Bucharest']);
      expect(result.jobs[2].location).toEqual(['România']);
      expect(result.jobs[3].location).toEqual(['România']);
    });

    it('should keep company uppercase', () => {
      const payload = {
        source: 'omniconvert.com',
        company: 'omniconvert srl',
        cif: '31411197',
        jobs: []
      };

      const result = index.transformJobsForSOLR(payload);

      expect(result.company).toBe('OMNICONVERT SRL');
    });

    it('should normalize workmode values', () => {
      const payload = {
        jobs: [
          { url: 'https://www.omniconvert.com/jobs/1', title: 'Job 1', workmode: 'Remote' },
          { url: 'https://www.omniconvert.com/jobs/2', title: 'Job 2', workmode: 'ON-SITE' },
          { url: 'https://www.omniconvert.com/jobs/3', title: 'Job 3', workmode: 'Hybrid' },
          { url: 'https://www.omniconvert.com/jobs/4', title: 'Job 4', workmode: 'hybrid' }
        ]
      };

      const result = index.transformJobsForSOLR(payload);

      expect(result.jobs[0].workmode).toBe('remote');
      expect(result.jobs[1].workmode).toBe('on-site');
      expect(result.jobs[2].workmode).toBe('hybrid');
      expect(result.jobs[3].workmode).toBe('hybrid');
    });

    it('should handle empty jobs array', () => {
      const result = index.transformJobsForSOLR({ jobs: [] });
      expect(result.jobs).toEqual([]);
    });
  });

  describe('mapToJobModel', () => {
    it('should map raw job to job model format', () => {
      const rawJob = {
        url: 'https://www.omniconvert.com/jobs/growth-engineer',
        title: 'Growth Engineer',
        location: 'București',
        workplaceType: 'hybrid'
      };

      const result = index.mapToJobModel(rawJob, '31411197', 'OMNICONVERT SRL');

      expect(result.url).toBe(rawJob.url);
      expect(result.title).toBe(rawJob.title);
      expect(result.company).toBe('OMNICONVERT SRL');
      expect(result.cif).toBe('31411197');
      expect(result.location).toEqual(['București']);
      expect(result.workmode).toBe('hybrid');
      expect(result.status).toBe('scraped');
      expect(result.date).toBeDefined();
    });

    it('should remove undefined fields', () => {
      const rawJob = {
        url: 'https://www.omniconvert.com/jobs/1',
        title: 'Job 1'
      };

      const result = index.mapToJobModel(rawJob, '31411197');

      expect(result.location).toBeUndefined();
      expect(result.workmode).toBeUndefined();
    });
  });
});
