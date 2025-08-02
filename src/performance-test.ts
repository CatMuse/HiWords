/**
 * 性能测试工具
 * 用于测试增量更新优化的效果
 */

export class PerformanceTest {
    private startTime: number = 0;
    private measurements: Map<string, number[]> = new Map();

    /**
     * 开始计时
     */
    start(label: string): void {
        this.startTime = performance.now();
        console.log(`🚀 开始测试: ${label}`);
    }

    /**
     * 结束计时并记录结果
     */
    end(label: string): number {
        const endTime = performance.now();
        const duration = endTime - this.startTime;
        
        if (!this.measurements.has(label)) {
            this.measurements.set(label, []);
        }
        this.measurements.get(label)!.push(duration);
        
        console.log(`⏱️ ${label} 耗时: ${duration.toFixed(2)}ms`);
        return duration;
    }

    /**
     * 获取平均性能数据
     */
    getAverageTime(label: string): number {
        const times = this.measurements.get(label);
        if (!times || times.length === 0) return 0;
        
        const sum = times.reduce((a, b) => a + b, 0);
        return sum / times.length;
    }

    /**
     * 打印性能报告
     */
    printReport(): void {
        console.log('\n📊 性能测试报告:');
        console.log('================');
        
        for (const [label, times] of this.measurements) {
            const avg = this.getAverageTime(label);
            const min = Math.min(...times);
            const max = Math.max(...times);
            
            console.log(`${label}:`);
            console.log(`  平均: ${avg.toFixed(2)}ms`);
            console.log(`  最小: ${min.toFixed(2)}ms`);
            console.log(`  最大: ${max.toFixed(2)}ms`);
            console.log(`  测试次数: ${times.length}`);
            console.log('');
        }
    }

    /**
     * 清空测试数据
     */
    clear(): void {
        this.measurements.clear();
    }
}

// 全局性能测试实例
export const perfTest = new PerformanceTest();

/**
 * 性能测试装饰器
 */
export function measurePerformance(label: string) {
    return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
        const method = descriptor.value;

        descriptor.value = async function (...args: any[]) {
            perfTest.start(label);
            const result = await method.apply(this, args);
            perfTest.end(label);
            return result;
        };

        return descriptor;
    };
}
