const { logger } = require('./logger');

class ExampleAutomation {
    constructor() {
        this.name = 'Example Automation';
    }

    async run() {
        try {
            logger.automation('Starting example automation', this.name);
            
            // Simulate some automation steps
            await this.step1();
            await this.step2();
            await this.step3();
            
            logger.automation('Example automation completed successfully', this.name, {
                stepsCompleted: 3,
                duration: '2.5s'
            });
            
        } catch (error) {
            logger.exception('Example automation failed', error);
            throw error;
        }
    }

    async step1() {
        logger.info('Executing step 1: Data collection');
        
        // Simulate data collection
        const data = await this.collectData();
        
        logger.dataProcessing('Data collection completed', 'user_profiles', {
            records: data.length,
            source: 'database'
        });
        
        return data;
    }

    async step2() {
        logger.info('Executing step 2: Web scraping');
        
        // Simulate web scraping
        const urls = ['https://example.com/page1', 'https://example.com/page2'];
        
        for (const url of urls) {
            logger.scraping('Scraping page', url, { status: 'success' });
            await this.delay(500); // Simulate scraping time
        }
        
        logger.scraping('Web scraping completed', 'example.com', {
            pagesScraped: urls.length,
            totalTime: '1.0s'
        });
    }

    async step3() {
        logger.info('Executing step 3: Data processing');
        
        // Simulate data processing
        const processedData = await this.processData();
        
        logger.dataProcessing('Data processing completed', 'analytics', {
            inputRecords: 100,
            outputRecords: 95,
            processingTime: '0.5s'
        });
        
        return processedData;
    }

    async collectData() {
        logger.debug('Collecting data from database');
        await this.delay(300);
        return Array.from({ length: 100 }, (_, i) => ({ id: i, name: `User ${i}` }));
    }

    async processData() {
        logger.debug('Processing collected data');
        await this.delay(500);
        return Array.from({ length: 95 }, (_, i) => ({ id: i, processed: true }));
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Run the example if this file is executed directly
if (require.main === module) {
    const automation = new ExampleAutomation();
    automation.run()
        .then(() => {
            console.log('✅ Example automation completed successfully!');
            console.log('🌐 Check the logs at: http://localhost:3001');
        })
        .catch(error => {
            console.error('❌ Example automation failed:', error.message);
            process.exit(1);
        });
}

module.exports = ExampleAutomation;
